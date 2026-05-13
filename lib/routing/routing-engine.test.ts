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
});
