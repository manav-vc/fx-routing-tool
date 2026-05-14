import { describe, expect, it } from "vitest";
import {
  applyLeg,
  rankRoutes,
  withDirectRouteComparison,
} from "./routing-engine";
import type { QuoteEdge } from "./types";

const edge = (
  from: string,
  to: string,
  provider: string,
  rate: number,
  feePercent = 0,
  feeFlat = 0,
): QuoteEdge => ({
  from,
  to,
  providerName: provider,
  providerType: provider.includes("Crypto") ? "stablecoin_venue" : "fiat_broker",
  rail: provider.includes("Crypto") ? "stablecoin" : "fiat",
  rate,
  feePercent,
  feeFlat,
  feeCurrency: "source",
});

describe("routing engine", () => {
  it("deducts percent and flat fees before converting a leg", () => {
    const quoted = applyLeg({
      amount: 1000,
      edge: edge("GBP", "USD", "AlphaFX", 1.5, 0.001, 5),
    });

    expect(quoted.feeAmount).toBeCloseTo(6);
    expect(quoted.outputAmount).toBeCloseTo(1491);
  });

  it("ranks routes by delivered amount and keeps the top three", () => {
    const routes = rankRoutes({
      source: "GBP",
      target: "JPY",
      amount: 1000,
      maxLegs: 3,
      edges: [
        edge("GBP", "JPY", "AlphaFX", 180),
        edge("GBP", "USD", "BetaBank", 1.25),
        edge("USD", "JPY", "GammaCrypto", 152),
        edge("GBP", "EUR", "DeltaMarkets", 1.15),
        edge("EUR", "JPY", "EpsilonChain", 162),
        edge("GBP", "CAD", "ZetaSwap", 1.7),
        edge("CAD", "JPY", "GammaCrypto", 110),
      ],
    });

    expect(routes).toHaveLength(3);
    expect(routes[0].path).toEqual(["GBP", "USD", "JPY"]);
    expect(routes[0].finalAmount).toBeCloseTo(190000);
    expect(routes[1].path).toEqual(["GBP", "CAD", "JPY"]);
    expect(routes[2].path).toEqual(["GBP", "EUR", "JPY"]);
  });

  it("prevents repeated-currency loops and limits paths to three legs", () => {
    const routes = rankRoutes({
      source: "GBP",
      target: "JPY",
      amount: 1000,
      maxLegs: 3,
      edges: [
        edge("GBP", "USD", "BetaBank", 1.25),
        edge("USD", "GBP", "AlphaFX", 0.8),
        edge("USD", "EUR", "DeltaMarkets", 0.92),
        edge("EUR", "CAD", "GammaCrypto", 1.5),
        edge("CAD", "JPY", "ZetaSwap", 110),
        edge("USD", "JPY", "GammaCrypto", 152),
      ],
    });

    expect(routes.map((route) => route.path)).toContainEqual(["GBP", "USD", "JPY"]);
    expect(routes.every((route) => route.legs.length <= 3)).toBe(true);
    expect(routes.every((route) => new Set(route.path).size === route.path.length)).toBe(true);
    expect(routes.some((route) => route.path.join(">") === "GBP>USD>GBP>USD>JPY")).toBe(false);
  });

  it("adds direct-route comparison when a direct quote exists", () => {
    const routes = rankRoutes({
      source: "GBP",
      target: "JPY",
      amount: 1000,
      maxLegs: 3,
      edges: [
        edge("GBP", "JPY", "AlphaFX", 180),
        edge("GBP", "USD", "BetaBank", 1.25),
        edge("USD", "JPY", "GammaCrypto", 152),
      ],
    });

    const compared = withDirectRouteComparison(routes);

    expect(compared[0].directDifferenceAmount).toBeCloseTo(10000);
    expect(compared[0].directDifferencePercent).toBeCloseTo(5.555555);
    expect(compared.find((route) => route.isDirect)?.directDifferenceAmount).toBeCloseTo(0);
  });

  it("matches an independent exhaustive route calculation", () => {
    const edges = [
      edge("GBP", "JPY", "AlphaFX", 188.5, 0.0015),
      edge("GBP", "USD", "BetaBank", 1.28, 0.0008, 3),
      edge("USD", "JPY", "GammaCrypto", 151.4, 0.001),
      edge("GBP", "EUR", "DeltaMarkets", 1.16, 0.0011, 2),
      edge("EUR", "JPY", "EpsilonChain", 163.8, 0.0012, 1),
      edge("GBP", "CAD", "ZetaSwap", 1.72, 0.0025),
      edge("CAD", "JPY", "GammaCrypto", 109.2, 0.001),
      edge("USD", "CHF", "AlphaFX", 0.88, 0.0015),
      edge("CHF", "JPY", "BetaBank", 173.6, 0.0008, 3),
      edge("EUR", "GBP", "LoopBank", 0.86),
    ];
    const amount = 2500;
    const expected = exhaustiveRouteKeys({
      source: "GBP",
      target: "JPY",
      amount,
      maxLegs: 3,
      edges,
      limit: 5,
    });

    const actual = rankRoutes({
      source: "GBP",
      target: "JPY",
      amount,
      maxLegs: 3,
      edges,
      limit: 5,
    });

    expect(actual.map(routeKey)).toEqual(expected.map((route) => route.key));
    actual.forEach((route, index) => {
      expect(route.finalAmount).toBeCloseTo(expected[index].finalAmount, 5);
    });
  });
});

function exhaustiveRouteKeys({
  source,
  target,
  amount,
  maxLegs,
  edges,
  limit,
}: {
  source: string;
  target: string;
  amount: number;
  maxLegs: number;
  edges: QuoteEdge[];
  limit: number;
}) {
  const routes: Array<{ key: string; finalAmount: number }> = [];
  const adjacency = new Map<string, QuoteEdge[]>();

  for (const candidate of edges) {
    const from = candidate.from.toUpperCase();
    adjacency.set(from, [
      ...(adjacency.get(from) ?? []),
      {
        ...candidate,
        from,
        to: candidate.to.toUpperCase(),
      },
    ]);
  }

  function walk(
    current: string,
    currentAmount: number,
    path: string[],
    providers: string[],
  ) {
    if (providers.length > 0 && current === target.toUpperCase()) {
      routes.push({
        key: `${path.join(">")}::${providers.join(">")}`,
        finalAmount: currentAmount,
      });
      return;
    }

    if (providers.length >= maxLegs) {
      return;
    }

    for (const candidate of adjacency.get(current) ?? []) {
      if (path.includes(candidate.to)) {
        continue;
      }

      const feeAmount = currentAmount * candidate.feePercent + candidate.feeFlat;
      const netAmount = Math.max(currentAmount - feeAmount, 0);
      const outputAmount = netAmount * candidate.rate;

      if (outputAmount <= 0) {
        continue;
      }

      walk(
        candidate.to,
        outputAmount,
        [...path, candidate.to],
        [...providers, candidate.providerName],
      );
    }
  }

  walk(source.toUpperCase(), amount, [source.toUpperCase()], []);

  return routes.sort((a, b) => b.finalAmount - a.finalAmount).slice(0, limit);
}

function routeKey(route: { path: string[]; legs: Array<{ providerName: string }> }) {
  return `${route.path.join(">")}::${route.legs.map((leg) => leg.providerName).join(">")}`;
}
