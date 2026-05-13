import { fetchLiveProviderEdges, SUPPORTED_CURRENCIES } from "./provider-adapters";
import { buildStaticProviderEdges, getProviders } from "./providers";
import { findBestDirectRoute, rankRoutes, routeLabel, withDirectRouteComparison } from "./routing-engine";
import type { ProviderStatus, QuoteEdge, QuoteResponse, RailMode, ScalePoint } from "./types";

export interface QuoteRequest {
  source: string;
  target: string;
  amount: number;
  railMode: RailMode;
}

export async function quoteOrder(request: QuoteRequest): Promise<QuoteResponse> {
  const source = request.source.toUpperCase();
  const target = request.target.toUpperCase();
  const providers = getProviders();
  const staticResult = buildStaticProviderEdges(providers);
  const liveProviders = providers.filter((provider) => provider.rate_source === "live_api");
  const liveResults = await Promise.allSettled(
    liveProviders.map((provider) => fetchLiveProviderEdges(provider)),
  );

  const liveEdges: QuoteEdge[] = [];
  const liveStatuses: ProviderStatus[] = [];

  for (let index = 0; index < liveResults.length; index += 1) {
    const result = liveResults[index];
    const provider = liveProviders[index];

    if (result.status === "fulfilled") {
      liveEdges.push(...result.value.edges);
      liveStatuses.push(result.value.status);
    } else {
      liveStatuses.push({
        providerName: provider.name,
        state: "unavailable",
        message: result.reason instanceof Error ? result.reason.message : "Provider unavailable",
        quotedPairs: 0,
        latencyMs: 0,
      });
    }
  }

  const allEdges = filterEdgesByRailMode([...liveEdges, ...staticResult.edges], request.railMode);
  const allRoutes = rankRoutes({
    source,
    target,
    amount: request.amount,
    maxLegs: 3,
    edges: allEdges,
    limit: Number.MAX_SAFE_INTEGER,
  });
  const directRoute = findBestDirectRoute(allRoutes);
  const routes = withDirectRouteComparison(
    allRoutes.sort((a, b) => b.finalAmount - a.finalAmount).slice(0, 3),
    directRoute,
  );

  return {
    routes,
    directRoute,
    providerStatus: [...liveStatuses, ...staticResult.statuses],
    scaleAnalysis: buildScaleAnalysis({
      source,
      target,
      amount: request.amount,
      edges: allEdges,
    }),
    generatedAt: new Date().toISOString(),
  };
}

export function getSupportedCurrencies(): string[] {
  return [...SUPPORTED_CURRENCIES];
}

function filterEdgesByRailMode(edges: QuoteEdge[], railMode: RailMode): QuoteEdge[] {
  if (railMode === "fiat_only") {
    return edges.filter((edge) => edge.rail === "fiat");
  }

  return edges;
}

export function buildScaleAnalysis({
  source,
  target,
  amount,
  edges,
}: {
  source: string;
  target: string;
  amount: number;
  edges: QuoteEdge[];
}): ScalePoint[] {
  let previousRouteId: string | null = null;

  return scaleAmounts(amount).map((scaledAmount) => {
    const bestRoute =
      rankRoutes({
        source,
        target,
        amount: scaledAmount,
        maxLegs: 3,
        edges,
        limit: 1,
      })[0] ?? null;
    const bestRouteId = bestRoute?.id ?? null;
    const routeChanged = previousRouteId !== null && bestRouteId !== previousRouteId;

    previousRouteId = bestRouteId;

    return {
      amount: scaledAmount,
      bestRouteId,
      bestRouteLabel: bestRoute ? routeLabel(bestRoute) : null,
      finalAmount: bestRoute?.finalAmount ?? null,
      deliveredPerSource: bestRoute ? bestRoute.finalAmount / scaledAmount : null,
      routeChanged,
    };
  });
}

export function scaleAmounts(amount: number): number[] {
  const multipliers = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100];
  const raw = multipliers.map((multiplier) => amount * multiplier);
  const unique = new Set(raw.map((value) => Math.max(1, Math.round(value * 100) / 100)));
  return [...unique].sort((a, b) => a - b);
}
