import { describe, expect, it } from "vitest";
import {
  fetchLiveProviderEdges,
  normalizeExchangeRateApiRate,
  normalizeFawazRate,
  normalizeFrankfurterRate,
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
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);

      if (url.endsWith("/USD")) {
        return new Response("too many requests", { status: 429 });
      }

      return Response.json(allFiatRates);
    };

    const result = await fetchLiveProviderEdges(betaBankProvider, fetcher);

    expect(result.edges.length).toBeGreaterThan(0);
    expect(result.status.state).toBe("degraded");
    expect(result.status.message).toContain("Rate limited");
  });

  it("marks a live provider as unavailable when all base requests time out", async () => {
    const fetcher: typeof fetch = (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });

    const result = await fetchLiveProviderEdges(betaBankProvider, fetcher, 1);

    expect(result.edges).toHaveLength(0);
    expect(result.status.state).toBe("unavailable");
    expect(result.status.message).toContain("Timed out");
  });

  it("returns no edges instead of throwing when a provider omits requested pairs", async () => {
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
});
