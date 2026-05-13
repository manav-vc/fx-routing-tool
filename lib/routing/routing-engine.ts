import Decimal from "decimal.js";
import type { QuoteEdge, RouteLegQuote, RouteQuote } from "./types";

export interface ApplyLegInput {
  amount: number;
  edge: QuoteEdge;
}

export interface RankRoutesInput {
  source: string;
  target: string;
  amount: number;
  maxLegs: number;
  edges: QuoteEdge[];
  limit?: number;
}

const toNumber = (value: Decimal) => Number(value.toDecimalPlaces(8).toString());

export function applyLeg({ amount, edge }: ApplyLegInput): RouteLegQuote {
  const inputAmount = new Decimal(amount);
  const percentFee = inputAmount.mul(edge.feePercent);
  const flatFee = new Decimal(edge.feeFlat);
  const feeAmount = percentFee.add(flatFee);
  const netAmount = Decimal.max(inputAmount.sub(feeAmount), 0);
  const outputAmount = netAmount.mul(edge.rate);

  return {
    ...edge,
    inputAmount: toNumber(inputAmount),
    feeAmount: toNumber(feeAmount),
    netAmount: toNumber(netAmount),
    outputAmount: toNumber(outputAmount),
  };
}

export function rankRoutes({
  source,
  target,
  amount,
  maxLegs,
  edges,
  limit = 3,
}: RankRoutesInput): RouteQuote[] {
  const normalizedSource = source.toUpperCase();
  const normalizedTarget = target.toUpperCase();
  const adjacency = new Map<string, QuoteEdge[]>();

  for (const edge of edges) {
    const key = edge.from.toUpperCase();
    const list = adjacency.get(key) ?? [];
    list.push({ ...edge, from: edge.from.toUpperCase(), to: edge.to.toUpperCase() });
    adjacency.set(key, list);
  }

  const routes: RouteQuote[] = [];

  function walk(current: string, currentAmount: number, path: string[], legs: RouteLegQuote[]) {
    if (legs.length > 0 && current === normalizedTarget) {
      routes.push(makeRoute(path, legs));
      return;
    }

    if (legs.length >= maxLegs) {
      return;
    }

    for (const edge of adjacency.get(current) ?? []) {
      if (path.includes(edge.to)) {
        continue;
      }

      const quotedLeg = applyLeg({ amount: currentAmount, edge });

      if (quotedLeg.outputAmount <= 0) {
        continue;
      }

      walk(edge.to, quotedLeg.outputAmount, [...path, edge.to], [...legs, quotedLeg]);
    }
  }

  walk(normalizedSource, amount, [normalizedSource], []);

  return withDirectRouteComparison(
    routes
      .sort((a, b) => b.finalAmount - a.finalAmount)
      .slice(0, limit),
    findBestDirectRoute(routes),
  );
}

export function findBestDirectRoute(routes: RouteQuote[]): RouteQuote | null {
  return (
    routes
      .filter((route) => route.isDirect)
      .sort((a, b) => b.finalAmount - a.finalAmount)[0] ?? null
  );
}

export function withDirectRouteComparison(
  routes: RouteQuote[],
  directRoute: RouteQuote | null = findBestDirectRoute(routes),
): RouteQuote[] {
  if (!directRoute) {
    return routes.map((route) => ({
      ...route,
      directDifferenceAmount: null,
      directDifferencePercent: null,
    }));
  }

  return routes.map((route) => {
    const difference = new Decimal(route.finalAmount).sub(directRoute.finalAmount);
    const percent = new Decimal(directRoute.finalAmount).eq(0)
      ? new Decimal(0)
      : difference.div(directRoute.finalAmount).mul(100);

    return {
      ...route,
      directDifferenceAmount: toNumber(difference),
      directDifferencePercent: toNumber(percent),
    };
  });
}

export function routeLabel(route: RouteQuote): string {
  return route.legs
    .map((leg, index) => `${index === 0 ? leg.from : ""}${index === 0 ? " " : ""}->[${leg.providerName}]-> ${leg.to}`)
    .join(" ");
}

function makeRoute(path: string[], legs: RouteLegQuote[]): RouteQuote {
  const providers = legs.map((leg) => leg.providerName).join("-");
  const id = `${path.join("-")}-${providers}`;

  return {
    id,
    path,
    legs,
    finalAmount: legs.at(-1)?.outputAmount ?? 0,
    isDirect: legs.length === 1,
    directDifferenceAmount: null,
    directDifferencePercent: null,
  };
}
