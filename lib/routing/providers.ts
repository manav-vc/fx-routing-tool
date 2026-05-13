import providersJson from "@/data/providers.json";
import type { ProviderConfig, ProvidersFile, ProviderStatus, QuoteEdge } from "./types";
import { edgeFromProvider } from "./provider-adapters";

export function getProviders(): ProviderConfig[] {
  return (providersJson as ProvidersFile).providers;
}

export function buildStaticProviderEdges(providers = getProviders()): {
  edges: QuoteEdge[];
  statuses: ProviderStatus[];
} {
  const staticProviders = providers.filter((provider) => provider.rate_source === "static");
  const edges = staticProviders.flatMap((provider) =>
    (provider.pairs ?? []).map((pair) =>
      edgeFromProvider(provider, pair.from, pair.to, pair.rate, "stablecoin"),
    ),
  );

  return {
    edges,
    statuses: staticProviders.map((provider) => ({
      providerName: provider.name,
      state: "available",
      message: `${provider.pairs?.length ?? 0} inline pairs loaded`,
      quotedPairs: provider.pairs?.length ?? 0,
      latencyMs: 0,
    })),
  };
}
