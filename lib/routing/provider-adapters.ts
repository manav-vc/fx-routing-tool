import type { ProviderConfig, ProviderStatus, QuoteEdge } from "./types";

const DEFAULT_TIMEOUT_MS = 3500;
const DEFAULT_MAX_RETRIES = 1;
const DEFAULT_RETRY_DELAY_MS = 125;
const DEFAULT_CIRCUIT_OPEN_MS = 60_000;
const DEFAULT_STALE_CACHE_MS = 10 * 60_000;
const CIRCUIT_FAILURE_THRESHOLD = 3;

export const FIAT_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF"] as const;
export const STABLECOIN_CURRENCIES = ["USDT", "USDC"] as const;
export const SUPPORTED_CURRENCIES = [...FIAT_CURRENCIES, ...STABLECOIN_CURRENCIES] as const;

type Fetcher = typeof fetch;

interface LiveProviderResult {
  edges: QuoteEdge[];
  status: ProviderStatus;
}

interface ProviderBaseResult {
  edges: QuoteEdge[];
  attempts: number;
}

interface ProviderResilienceOptions {
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
  circuitOpenMs: number;
  staleCacheMs: number;
  now: () => number;
}

export interface FetchLiveProviderOptions {
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  circuitOpenMs?: number;
  staleCacheMs?: number;
  now?: () => number;
}

interface ProviderResilienceState {
  consecutiveFailures: number;
  circuitOpenedAt: number | null;
  cachedEdges: QuoteEdge[];
  cachedAt: number | null;
}

const providerResilienceState = new Map<string, ProviderResilienceState>();

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
  optionsOrTimeout: number | FetchLiveProviderOptions = {},
): Promise<LiveProviderResult> {
  const options = normalizeOptions(optionsOrTimeout);
  const started = options.now();
  const providerState = getProviderState(provider.name);

  if (!provider.api) {
    return {
      edges: [],
      status: status(provider.name, "unavailable", "Missing API configuration", 0, started, options),
    };
  }

  if (isCircuitOpen(providerState, options)) {
    const staleFallback = staleCacheFallback(provider, providerState, started, options);

    if (staleFallback) {
      return staleFallback;
    }

    return {
      edges: [],
      status: status(
        provider.name,
        "unavailable",
        "Circuit open after repeated provider failures",
        0,
        started,
        options,
      ),
    };
  }

  const baseResults = await Promise.allSettled(
    FIAT_CURRENCIES.map((base) => fetchProviderBaseRates(provider, base, fetcher, options)),
  );

  const edges = baseResults
    .flatMap((result) => (result.status === "fulfilled" ? result.value.edges : []))
    .filter((edge): edge is QuoteEdge => Boolean(edge));

  const rejectedCount = baseResults.filter((result) => result.status === "rejected").length;
  const rejectionMessages = baseResults
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => errorMessage(result.reason));
  const retryCount = baseResults
    .filter((result): result is PromiseFulfilledResult<ProviderBaseResult> => result.status === "fulfilled")
    .reduce((sum, result) => sum + Math.max(0, result.value.attempts - 1), 0);

  if (edges.length === 0) {
    recordProviderFailure(providerState, options);
    const staleFallback = staleCacheFallback(
      provider,
      providerState,
      started,
      options,
      rejectionMessages[0] ?? "Provider returned no usable quotes",
    );

    if (staleFallback) {
      return staleFallback;
    }

    return {
      edges,
      status: status(
        provider.name,
        "unavailable",
        rejectionMessages[0] ?? "Provider returned no usable quotes",
        edges.length,
        started,
        options,
      ),
    };
  }

  recordProviderSuccess(providerState, edges, options);

  return {
    edges,
    status: status(
      provider.name,
      rejectedCount > 0 ? "degraded" : "available",
      rejectedCount > 0
        ? `${edges.length} pairs normalized; ${rejectedCount} base request${rejectedCount === 1 ? "" : "s"} failed (${summarizeErrors(rejectionMessages)})`
        : retryCount > 0
          ? `${edges.length} pairs normalized; retried ${retryCount} request${retryCount === 1 ? "" : "s"}`
        : `${edges.length} pairs normalized`,
      edges.length,
      started,
      options,
    ),
  };
}

async function fetchProviderBaseRates(
  provider: ProviderConfig,
  base: string,
  fetcher: Fetcher,
  options: ProviderResilienceOptions,
): Promise<ProviderBaseResult> {
  const targets = FIAT_CURRENCIES.filter((currency) => currency !== base);
  const url = buildProviderUrl(provider, base, targets);
  const { json, attempts } = await fetchJsonWithResilience(url, fetcher, options);

  const edges = targets
    .map((target) => {
      const rate = normalizeProviderRate(provider.name, json, base, target);

      if (rate === null) {
        return null;
      }

      return edgeFromProvider(provider, base, target, rate, "fiat");
    })
    .filter((edge): edge is QuoteEdge => Boolean(edge));

  return { edges, attempts };
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

async function fetchJsonWithResilience(
  url: string,
  fetcher: Fetcher,
  options: ProviderResilienceOptions,
): Promise<{ json: unknown; attempts: number }> {
  let lastError: unknown;
  let attempts = 0;

  for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
    attempts = attempt + 1;

    try {
      const json = await fetchJsonWithTimeout(url, fetcher, options.timeoutMs);
      return { json, attempts };
    } catch (error) {
      lastError = error;

      if (attempt >= options.maxRetries || !isRetryableProviderError(error)) {
        throw error;
      }

      await wait(options.retryDelayMs);
    }
  }

  throw lastError;
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
  options: ProviderResilienceOptions,
): ProviderStatus {
  return {
    providerName,
    state,
    message,
    quotedPairs,
    latencyMs: options.now() - started,
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

function normalizeOptions(optionsOrTimeout: number | FetchLiveProviderOptions): ProviderResilienceOptions {
  const options = typeof optionsOrTimeout === "number" ? { timeoutMs: optionsOrTimeout } : optionsOrTimeout;

  return {
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
    retryDelayMs: options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
    circuitOpenMs: options.circuitOpenMs ?? DEFAULT_CIRCUIT_OPEN_MS,
    staleCacheMs: options.staleCacheMs ?? DEFAULT_STALE_CACHE_MS,
    now: options.now ?? Date.now,
  };
}

function getProviderState(providerName: string): ProviderResilienceState {
  const existing = providerResilienceState.get(providerName);

  if (existing) {
    return existing;
  }

  const created: ProviderResilienceState = {
    consecutiveFailures: 0,
    circuitOpenedAt: null,
    cachedEdges: [],
    cachedAt: null,
  };
  providerResilienceState.set(providerName, created);
  return created;
}

function isCircuitOpen(state: ProviderResilienceState, options: ProviderResilienceOptions): boolean {
  if (state.circuitOpenedAt === null) {
    return false;
  }

  if (options.now() - state.circuitOpenedAt >= options.circuitOpenMs) {
    state.circuitOpenedAt = null;
    state.consecutiveFailures = 0;
    return false;
  }

  return true;
}

function recordProviderSuccess(
  state: ProviderResilienceState,
  edges: QuoteEdge[],
  options: ProviderResilienceOptions,
) {
  state.consecutiveFailures = 0;
  state.circuitOpenedAt = null;
  state.cachedEdges = edges;
  state.cachedAt = options.now();
}

function recordProviderFailure(state: ProviderResilienceState, options: ProviderResilienceOptions) {
  state.consecutiveFailures += 1;

  if (state.consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD) {
    state.circuitOpenedAt = options.now();
  }
}

function staleCacheFallback(
  provider: ProviderConfig,
  state: ProviderResilienceState,
  started: number,
  options: ProviderResilienceOptions,
  liveFailureMessage = "Circuit open",
): LiveProviderResult | null {
  if (state.cachedAt === null || state.cachedEdges.length === 0) {
    return null;
  }

  const ageMs = options.now() - state.cachedAt;

  if (ageMs > options.staleCacheMs) {
    return null;
  }

  return {
    edges: state.cachedEdges,
    status: status(
      provider.name,
      "degraded",
      `Using stale cached quotes from ${Math.round(ageMs / 1000)}s ago; live provider issue: ${liveFailureMessage}`,
      state.cachedEdges.length,
      started,
      options,
    ),
  };
}

function isRetryableProviderError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return true;
  }

  if (error.message.includes("Timed out") || error.message.includes("Rate limited")) {
    return true;
  }

  if (/HTTP 5\d\d/.test(error.message)) {
    return true;
  }

  return !/HTTP 4\d\d/.test(error.message);
}

async function wait(delayMs: number): Promise<void> {
  if (delayMs <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

export function resetProviderResilienceState() {
  providerResilienceState.clear();
}
