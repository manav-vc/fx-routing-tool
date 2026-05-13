import { describe, expect, it } from "vitest";
import { buildScaleAnalysis } from "./quote-service";
import type { QuoteEdge } from "./types";

const edge = (
  provider: string,
  rate: number,
  feePercent = 0,
  feeFlat = 0,
): QuoteEdge => ({
  from: "USD",
  to: "EUR",
  providerName: provider,
  providerType: "fiat_broker",
  rail: "fiat",
  rate,
  feePercent,
  feeFlat,
  feeCurrency: "source",
});

describe("quote service scale analysis", () => {
  it("surfaces when the optimal route changes as amount scales", () => {
    const analysis = buildScaleAnalysis({
      source: "USD",
      target: "EUR",
      amount: 100,
      edges: [
        edge("PercentOnly", 0.89),
        edge("FlatHeavy", 0.92, 0, 30),
      ],
    });

    expect(analysis.length).toBeGreaterThan(6);
    expect(analysis[0].bestRouteLabel).toContain("PercentOnly");
    expect(analysis.at(-1)?.bestRouteLabel).toContain("FlatHeavy");
    expect(new Set(analysis.map((point) => point.bestRouteId)).size).toBe(2);
    expect(analysis.some((point) => point.routeChanged)).toBe(true);
  });
});
