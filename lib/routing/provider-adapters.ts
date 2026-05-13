import type { ProviderConfig, ProviderStatus, QuoteEdge } from "./types";

const DEFAULT_TIMEOUT_MS = 3500;

export const FIAT_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF"] as const;
export const STABLECOIN_CURRENCIES = ["USDT", "USDC"] as const;
export const SUPPORTED_CURRENCIES = [...FIAT_CURRENCIES, ...STABLECOIN_CURRENCIES] as const;

type Fetcher = typeof fetch;

interface LiveProviderResult {
  edges: QuoteEdge[];
  status: ProviderStatus;
}

export function normalizeFrankfurterRate(
  response: unknown,
  _base: string,
  target: string,
): number | null {
  if (!isRecord(response) || !isRecord(response.rates)) {
    return null;
  }

  const quoted = response.rates[target.toUpperCase()];
  return typeof quoted === "number" && Number.isFinite(quoted) ? quoted : null;
}

export function normalizeExchangeRateApiRate(
  response: unknown,
  _base: string,
  target: string,
): number | null {
  if (!isRecord(response) || response.result !== "success" || !isRecord(response.rates)) {
    return null;
  }

  const quoted = response.rates[target.toUpperCase()];
  return typeof quoted === "number" && Number.isFinite(quoted) ? quoted : null;
}

export function normalizeFawazRate(response: unknown, base: string, target: string): number | null {
  const baseKey = base.toLowerCase();
  const targetKey = target.toLowerCase();

  if (!isRecord(response) || !isRecord(response[baseKey])) {
    return null;
  }

  const quoted = response[baseKey][targetKey];
  return typeof quoted === "number" && Number.isFinite(quoted) ? quoted : null;
}

export async function fetchLiveProviderEdges(
  provider: ProviderConfig,
  fetcher: Fetcher = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<LiveProviderResult> {
  const started = Date.now();

  if (!provider.api) {
    return {
      edges: [],
      status: status(provider.name, "unavailable", "Missing API configuration", 0, started),
    };
  }

  const baseResults = await Promise.allSettled(
    FIAT_CURRENCIES.map((base) => fetchProviderBaseRates(provider, base, fetcher, timeoutMs)),
  );

  const edges = baseResults
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .filter((edge): edge is QuoteEdge => Boolean(edge));

  const rejectedCount = baseResults.filter((result) => result.status === "rejected").length;
  const rejectionMessages = baseResults
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => errorMessage(result.reason));

  if (edges.length === 0) {
    return {
      edges,
      status: status(
        provider.name,
        "unavailable",
        rejectionMessages[0] ?? "Provider returned no usable quotes",
        edges.length,
        started,
      ),
    };
  }

  return {
    edges,
    status: status(
      provider.name,
      rejectedCount > 0 ? "degraded" : "available",
      rejectedCount > 0
        ? `${edges.length} pairs normalized; ${rejectedCount} base request${rejectedCount === 1 ? "" : "s"} failed (${summarizeErrors(rejectionMessages)})`
        : `${edges.length} pairs normalized`,
      edges.length,
      started,
    ),
  };
}

async function fetchProviderBaseRates(
  provider: ProviderConfig,
  base: string,
  fetcher: Fetcher,
  timeoutMs: number,
): Promise<QuoteEdge[]> {
  const targets = FIAT_CURRENCIES.filter((currency) => currency !== base);
  const url = buildProviderUrl(provider, base, targets);
  const response = await fetchJsonWithTimeout(url, fetcher, timeoutMs);

  return targets
    .map((target) => {
      const rate = normalizeProviderRate(provider.name, response, base, target);

      if (rate === null) {
        return null;
      }

      return edgeFromProvider(provider, base, target, rate, "fiat");
    })
    .filter((edge): edge is QuoteEdge => Boolean(edge));
}

function buildProviderUrl(provider: ProviderConfig, base: string, targets: string[]): string {
  const endpoint = provider.api?.endpoint;

  if (!endpoint) {
    throw new Error(`${provider.name} is missing an endpoint`);
  }

  if (provider.name === "AlphaFX") {
    return `${endpoint}?base=${base}&symbols=${targets.join(",")}`;
  }

  if (provider.name === "BetaBank") {
    return `${endpoint}/${base}`;
  }

  if (provider.name === "DeltaMarkets") {
    return `${endpoint}/${base.toLowerCase()}.json`;
  }

  throw new Error(`Unsupported live provider: ${provider.name}`);
}

function normalizeProviderRate(
  providerName: string,
  response: unknown,
  base: string,
  target: string,
): number | null {
  if (providerName === "AlphaFX") {
    return normalizeFrankfurterRate(response, base, target);
  }

  if (providerName === "BetaBank") {
    return normalizeExchangeRateApiRate(response, base, target);
  }

  if (providerName === "DeltaMarkets") {
    return normalizeFawazRate(response, base, target);
  }

  return null;
}

async function fetchJsonWithTimeout(url: string, fetcher: Fetcher, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetcher(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: { accept: "application/json" },
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error("Rate limited (HTTP 429)");
      }

      throw new Error(`HTTP ${response.status} from ${url}`);
    }

    return response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Timed out after ${timeoutMs}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function edgeFromProvider(
  provider: ProviderConfig,
  from: string,
  to: string,
  rate: number,
  rail: QuoteEdge["rail"],
): QuoteEdge {
  return {
    from: from.toUpperCase(),
    to: to.toUpperCase(),
    providerName: provider.name,
    providerType: provider.type,
    rail,
    rate,
    feePercent: provider.fee_model.fee_percent,
    feeFlat: provider.fee_model.fee_flat,
    feeCurrency: provider.fee_model.fee_currency,
  };
}

function status(
  providerName: string,
  state: ProviderStatus["state"],
  message: string,
  quotedPairs: number,
  started: number,
): ProviderStatus {
  return {
    providerName,
    state,
    message,
    quotedPairs,
    latencyMs: Date.now() - started,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "Provider request failed";
}

function summarizeErrors(messages: string[]): string {
  const uniqueMessages = [...new Set(messages)];
  return uniqueMessages.slice(0, 2).join("; ");
}
