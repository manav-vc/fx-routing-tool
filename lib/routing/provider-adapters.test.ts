import { describe, expect, it } from "vitest";
import {
  fetchLiveProviderEdges,
  normalizeExchangeRateApiRate,
  normalizeFawazRate,
  normalizeFrankfurterRate,
  resetProviderResilienceState,
} from "./provider-adapters";
import type { ProviderConfig } from "./types";

const betaBankProvider: ProviderConfig = {
  name: "BetaBank",
  type: "fiat_broker",
  rate_source: "live_api",
  api: {
    endpoint: "https://rates.test/latest",
    docs: "https://example.test",
  },
  fee_model: {
    fee_percent: 0.0008,
    fee_flat: 25,
    fee_currency: "source",
  },
};

const allFiatRates = {
  result: "success",
  rates: {
    USD: 1,
    EUR: 0.9,
    GBP: 0.8,
    JPY: 150,
    CAD: 1.35,
    AUD: 1.5,
    CHF: 0.88,
  },
};

describe("provider adapters", () => {
  it("retries transient provider failures before returning normalized edges", async () => {
    resetProviderResilienceState();
    const attemptsByUrl = new Map<string, number>();
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      const attempts = attemptsByUrl.get(url) ?? 0;
      attemptsByUrl.set(url, attempts + 1);

      if (attempts === 0) {
        return new Response("temporary outage", { status: 503 });
      }

      return Response.json(allFiatRates);
    };

    const result = await fetchLiveProviderEdges(betaBankProvider, fetcher, {
      retryDelayMs: 0,
    });

    expect(result.edges.length).toBeGreaterThan(0);
    expect(result.status.state).toBe("available");
    expect(result.status.message).toContain("retried");
    expect([...attemptsByUrl.values()].every((attempts) => attempts === 2)).toBe(true);
  });

  it("normalizes a Frankfurter rate response", () => {
    expect(
      normalizeFrankfurterRate(
        { amount: 1, base: "USD", date: "2026-05-13", rates: { JPY: 157.77 } },
        "USD",
        "JPY",
      ),
    ).toBe(157.77);
  });

  it("normalizes an ExchangeRate-API response", () => {
    expect(
      normalizeExchangeRateApiRate(
        {
          result: "success",
          provider: "https://www.exchangerate-api.com",
          base_code: "USD",
          rates: { CAD: 1.369875 },
        },
        "USD",
        "CAD",
      ),
    ).toBe(1.369875);
  });

  it("normalizes a fawaz currency-api response", () => {
    expect(
      normalizeFawazRate(
        { date: "2026-05-13", usd: { eur: 0.85207835 } },
        "USD",
        "EUR",
      ),
    ).toBe(0.85207835);
  });

  it("returns null when the provider response is malformed or missing a pair", () => {
    expect(normalizeFrankfurterRate({ rates: {} }, "USD", "JPY")).toBeNull();
    expect(normalizeExchangeRateApiRate({ result: "error" }, "USD", "CAD")).toBeNull();
    expect(normalizeFawazRate({ usd: {} }, "USD", "EUR")).toBeNull();
  });

  it("marks a live provider as degraded when one base request is rate-limited", async () => {
    resetProviderResilienceState();
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);

      if (url.endsWith("/USD")) {
        return new Response("too many requests", { status: 429 });
      }

      return Response.json(allFiatRates);
    };

    const result = await fetchLiveProviderEdges(betaBankProvider, fetcher, {
      retryDelayMs: 0,
    });

    expect(result.edges.length).toBeGreaterThan(0);
    expect(result.status.state).toBe("degraded");
    expect(result.status.message).toContain("Rate limited");
  });

  it("marks a live provider as unavailable when all base requests time out", async () => {
    resetProviderResilienceState();
    const fetcher: typeof fetch = (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });

    const result = await fetchLiveProviderEdges(betaBankProvider, fetcher, {
      timeoutMs: 1,
      retryDelayMs: 0,
    });

    expect(result.edges).toHaveLength(0);
    expect(result.status.state).toBe("unavailable");
    expect(result.status.message).toContain("Timed out");
  });

  it("returns no edges instead of throwing when a provider omits requested pairs", async () => {
    resetProviderResilienceState();
    const fetcher: typeof fetch = async () =>
      Response.json({
        result: "success",
        rates: {},
      });

    const result = await fetchLiveProviderEdges(betaBankProvider, fetcher);

    expect(result.edges).toHaveLength(0);
    expect(result.status.state).toBe("unavailable");
    expect(result.status.message).toContain("no usable quotes");
  });

  it("falls back to stale cached edges when a provider later fails", async () => {
    resetProviderResilienceState();
    const successfulFetch: typeof fetch = async () => Response.json(allFiatRates);
    const failedFetch: typeof fetch = async () => new Response("rate limit", { status: 429 });

    const fresh = await fetchLiveProviderEdges(betaBankProvider, successfulFetch, {
      retryDelayMs: 0,
    });
    const stale = await fetchLiveProviderEdges(betaBankProvider, failedFetch, {
      retryDelayMs: 0,
    });

    expect(fresh.status.state).toBe("available");
    expect(stale.edges).toHaveLength(fresh.edges.length);
    expect(stale.status.state).toBe("degraded");
    expect(stale.status.message).toContain("stale cached quotes");
  });

  it("opens a circuit after repeated full provider failures and skips new calls", async () => {
    resetProviderResilienceState();
    let callCount = 0;
    const failedFetch: typeof fetch = async () => {
      callCount += 1;
      return new Response("provider down", { status: 503 });
    };

    await fetchLiveProviderEdges(betaBankProvider, failedFetch, { retryDelayMs: 0 });
    await fetchLiveProviderEdges(betaBankProvider, failedFetch, { retryDelayMs: 0 });
    await fetchLiveProviderEdges(betaBankProvider, failedFetch, { retryDelayMs: 0 });
    const callsBeforeOpen = callCount;

    const openCircuit = await fetchLiveProviderEdges(betaBankProvider, failedFetch, {
      retryDelayMs: 0,
    });

    expect(openCircuit.edges).toHaveLength(0);
    expect(openCircuit.status.state).toBe("unavailable");
    expect(openCircuit.status.message).toContain("Circuit open");
    expect(callCount).toBe(callsBeforeOpen);
  });
});
