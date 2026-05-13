"use client";

import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  Filter,
  GitBranch,
  Loader2,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  MarkerType,
  ReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
} from "@xyflow/react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import clsx from "clsx";
import type { ProviderStatus, QuoteResponse, RailMode, RouteQuote } from "@/lib/routing/types";

const currencies = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "USDT", "USDC"];

const initialQuote: QuoteResponse | null = null;

type ScaleChartPoint = {
  amount: number;
  delivered: number | null;
  deliveredPerSource: number | null;
  label: string;
  routeChanged: boolean;
};

type ParallelEdgeData = {
  color: string;
  highlighted: boolean;
  label: string;
  offset: number;
};

const graphEdgeTypes = {
  parallelProvider: ParallelProviderEdge,
};

export default function Home() {
  const [source, setSource] = useState("GBP");
  const [target, setTarget] = useState("JPY");
  const [amount, setAmount] = useState(10000);
  const [railMode, setRailMode] = useState<RailMode>("all");
  const [quote, setQuote] = useState(initialQuote);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchQuote = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, target, amount, railMode }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message ?? "Quote request failed");
      }

      setQuote(await response.json());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Quote request failed");
    } finally {
      setLoading(false);
    }
  }, [amount, railMode, source, target]);

  const bestRoute = quote?.routes[0] ?? null;

  return (
    <main className="min-h-screen bg-[#f6f8fb] text-slate-900">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white">
                  <CircleDollarSign className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold tracking-normal text-slate-950">
                    FX RouteDesk
                  </h1>
                  <p className="text-sm text-slate-500">
                    Multi-leg quote routing across fiat brokers and stablecoin venues.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
                {quote?.generatedAt
                  ? `Quote updated ${new Date(quote.generatedAt).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}`
                  : "No quote yet"}
              </span>
              <button
                onClick={fetchQuote}
                disabled={loading}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <RefreshCw className="h-4 w-4" aria-hidden />
                )}
                Refresh quote
              </button>
            </div>
          </div>
          <ProviderStrip statuses={quote?.providerStatus ?? []} />
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[360px_1fr] lg:px-8">
        <aside className="h-fit rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Filter className="h-4 w-4 text-teal-700" aria-hidden />
            <h2 className="text-sm font-semibold uppercase tracking-normal text-slate-600">
              Quote controls
            </h2>
          </div>
          <div className="space-y-4">
            <CurrencySelect label="Source" value={source} onChange={setSource} />
            <CurrencySelect label="Target" value={target} onChange={setTarget} />
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Amount</span>
              <input
                className="mt-1 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-base font-semibold outline-none ring-teal-600 transition focus:ring-2"
                min={1}
                step={100}
                type="number"
                value={amount}
                onChange={(event) => setAmount(Number(event.target.value))}
              />
            </label>
            <div>
              <span className="text-sm font-medium text-slate-700">Rails</span>
              <div className="mt-2 grid grid-cols-2 rounded-md border border-slate-300 bg-slate-50 p-1">
                <RailButton active={railMode === "all"} onClick={() => setRailMode("all")}>
                  All rails
                </RailButton>
                <RailButton
                  active={railMode === "fiat_only"}
                  onClick={() => setRailMode("fiat_only")}
                >
                  Fiat only
                </RailButton>
              </div>
            </div>
            <button
              onClick={fetchQuote}
              disabled={loading || source === target || amount <= 0}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Run route search
            </button>
            {source === target ? (
              <p className="text-sm text-amber-700">Source and target must be different.</p>
            ) : null}
            {error ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}
          </div>
        </aside>

        <div className="space-y-5">
          <SummaryBand quote={quote} bestRoute={bestRoute} target={target} />
          <section className="grid gap-5 2xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
            <div className="space-y-4">
              <SectionHeader
                icon={<TrendingUp className="h-4 w-4" aria-hidden />}
                title="Top routes"
                detail="Ranked by amount delivered"
              />
              {loading && !quote ? <SkeletonRoutes /> : null}
              {quote && quote.routes.length === 0 ? (
                <EmptyState message="No viable route found for these currencies and rail filters." />
              ) : null}
              {quote?.routes.map((route, index) => (
                <RouteCard key={route.id} route={route} rank={index + 1} target={target} />
              ))}
            </div>
            <div className="space-y-5">
              <ScalingPanel quote={quote} source={source} target={target} />
              <GraphPanel routes={quote?.routes ?? []} bestRoute={bestRoute} />
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function CurrencySelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <select
        className="mt-1 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-base font-semibold outline-none ring-teal-600 transition focus:ring-2"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {currencies.map((currency) => (
          <option key={currency} value={currency}>
            {currency}
          </option>
        ))}
      </select>
    </label>
  );
}

function RailButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={clsx(
        "h-9 rounded-md text-sm font-semibold transition",
        active ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800",
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function ProviderStrip({ statuses }: { statuses: ProviderStatus[] }) {
  if (statuses.length === 0) {
    return (
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-16 rounded-lg border border-slate-200 bg-slate-50" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {statuses.map((status) => (
        <div key={status.providerName} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-slate-800">{status.providerName}</span>
            {status.state === "available" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-700" aria-hidden />
            ) : (
              <AlertTriangle
                className={clsx(
                  "h-4 w-4 shrink-0",
                  status.state === "degraded" ? "text-amber-600" : "text-red-600",
                )}
                aria-hidden
              />
            )}
          </div>
          <p className="mt-1 truncate text-xs text-slate-500" title={status.message}>
            {status.quotedPairs} pairs · {status.latencyMs}ms
          </p>
        </div>
      ))}
    </div>
  );
}

function SummaryBand({
  quote,
  bestRoute,
  target,
}: {
  quote: QuoteResponse | null;
  bestRoute: RouteQuote | null;
  target: string;
}) {
  return (
    <section className="grid gap-3 md:grid-cols-3">
      <Metric
        label="Best delivered"
        value={bestRoute ? formatMoney(bestRoute.finalAmount, target) : "--"}
        accent="teal"
      />
      <Metric
        label="Direct route"
        value={quote?.directRoute ? formatMoney(quote.directRoute.finalAmount, target) : "No direct quote"}
        accent="blue"
      />
      <Metric
        label="Route edge"
        value={
          bestRoute?.directDifferenceAmount !== null && bestRoute?.directDifferenceAmount !== undefined
            ? `${bestRoute.directDifferenceAmount >= 0 ? "+" : ""}${formatNumber(bestRoute.directDifferenceAmount)} ${target}`
            : "No benchmark"
        }
        accent="amber"
      />
    </section>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "teal" | "blue" | "amber";
}) {
  const colors = {
    teal: "border-teal-200 bg-teal-50 text-teal-800",
    blue: "border-sky-200 bg-sky-50 text-sky-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <span className={clsx("rounded-md border px-2 py-1 text-xs font-semibold", colors[accent])}>
        {label}
      </span>
      <p className="mt-3 text-2xl font-semibold tracking-normal text-slate-950">{value}</p>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  detail,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-slate-950">
        {icon}
        <h2 className="text-lg font-semibold tracking-normal">{title}</h2>
      </div>
      <span className="text-sm text-slate-500">{detail}</span>
    </div>
  );
}

function RouteCard({ route, rank, target }: { route: RouteQuote; rank: number; target: string }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-950 text-sm font-bold text-white">
              {rank}
            </span>
            <RoutePath route={route} />
          </div>
          <p className="mt-2 text-sm text-slate-500">
            {route.legs.length} leg{route.legs.length === 1 ? "" : "s"} ·{" "}
            {route.isDirect ? "Direct quote" : "Multi-leg route"}
          </p>
        </div>
        <div className="text-left md:text-right">
          <p className="max-w-full break-words text-xl font-semibold text-slate-950 sm:text-2xl">
            {formatMoney(route.finalAmount, target)}
          </p>
          <p
            className={clsx(
              "text-sm font-medium",
              (route.directDifferenceAmount ?? 0) >= 0 ? "text-teal-700" : "text-red-700",
            )}
          >
            {route.directDifferenceAmount === null
              ? "No direct benchmark"
              : `${route.directDifferenceAmount >= 0 ? "+" : ""}${formatNumber(route.directDifferenceAmount)} vs direct`}
          </p>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-[720px] text-left text-sm">
          <thead className="text-xs uppercase tracking-normal text-slate-500">
            <tr>
              <th className="px-2 pb-2 font-semibold">Leg</th>
              <th className="px-2 pb-2 font-semibold">Provider</th>
              <th className="px-2 pb-2 font-semibold">Rate</th>
              <th className="px-2 pb-2 font-semibold">Fees</th>
              <th className="px-2 pb-2 font-semibold">Output</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {route.legs.map((leg, index) => (
              <tr key={`${leg.providerName}-${leg.from}-${leg.to}-${index}`}>
                <td className="whitespace-nowrap px-2 py-2 font-semibold text-slate-800">
                  {leg.from} <ArrowRight className="mx-1 inline h-3 w-3" aria-hidden /> {leg.to}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-slate-600">{leg.providerName}</td>
                <td className="whitespace-nowrap px-2 py-2 font-mono text-slate-600">
                  {formatNumber(leg.rate, 6)}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-slate-600">
                  {formatNumber(leg.feeAmount)} {leg.from}
                </td>
                <td className="whitespace-nowrap px-2 py-2 font-semibold text-slate-800">
                  {formatNumber(leg.outputAmount)} {leg.to}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function RoutePath({ route }: { route: RouteQuote }) {
  return (
    <div className="flex flex-wrap items-center gap-1 text-sm font-semibold text-slate-900">
      {route.legs.map((leg, index) => (
        <span key={`${leg.providerName}-${index}`} className="inline-flex items-center gap-1">
          {index === 0 ? <span>{leg.from}</span> : null}
          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">
            {leg.providerName}
          </span>
          <ArrowRight className="h-3 w-3 text-slate-400" aria-hidden />
          <span>{leg.to}</span>
        </span>
      ))}
    </div>
  );
}

function ScalingPanel({
  quote,
  source,
  target,
}: {
  quote: QuoteResponse | null;
  source: string;
  target: string;
}) {
  const chartData = quote?.scaleAnalysis.map((point) => ({
    amount: point.amount,
    delivered: point.finalAmount,
    deliveredPerSource: point.deliveredPerSource,
    label: point.bestRouteLabel ?? "No route",
    routeChanged: point.routeChanged,
  }));
  const routeChangeCount = chartData?.filter((point) => point.routeChanged).length ?? 0;
  const scaleSummary = chartData?.length
    ? routeChangeCount > 0
      ? `${routeChangeCount} winner switch${routeChangeCount === 1 ? "" : "es"} detected`
      : "Same winner across sampled sizes"
    : "Run a quote to sample sizes";

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <SectionHeader
        icon={<TrendingUp className="h-4 w-4" aria-hidden />}
        title="Amount scaling"
        detail={`${source} to ${target}`}
      />
      <div className="mt-4 h-72">
        {chartData && chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ left: 8, right: 18, top: 12, bottom: 8 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis
                dataKey="amount"
                tick={{ fill: "#64748b", fontSize: 12 }}
                tickFormatter={(value) => formatCompact(value)}
              />
              <YAxis
                tick={{ fill: "#64748b", fontSize: 12 }}
                tickFormatter={(value) => formatCompact(value)}
              />
              <Tooltip
                content={(props) => (
                  <ScaleTooltip
                    active={props.active}
                    payload={props.payload as unknown as ReadonlyArray<{ payload?: ScaleChartPoint }> | undefined}
                    source={source}
                    target={target}
                  />
                )}
              />
              <Line
                dataKey="delivered"
                dot={{ r: 4, fill: "#0f766e" }}
                stroke="#0f766e"
                strokeWidth={2.5}
                type="monotone"
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState message="Run a quote to see scaling behavior." />
        )}
      </div>
      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">
            Winning route by amount
          </p>
          <span
            className={clsx(
              "rounded-md border px-2 py-1 text-xs font-semibold",
              routeChangeCount > 0
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-slate-200 bg-white text-slate-600",
            )}
          >
            {scaleSummary}
          </span>
        </div>
        {chartData && chartData.length > 0 ? (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {chartData.map((point) => (
              <div
                key={`${point.amount}-${point.label}`}
                className={clsx(
                  "rounded-md border bg-white p-2",
                  point.routeChanged ? "border-amber-300" : "border-slate-200",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-950">
                    {formatMoney(point.amount, source)}
                  </span>
                  {point.routeChanged ? (
                    <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                      Switch
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 break-words text-xs text-slate-600" title={point.label}>
                  {point.label}
                </p>
                <p className="mt-1 text-xs font-semibold text-teal-700">
                  {point.delivered === null ? "No route" : `${formatMoney(point.delivered, target)} delivered`}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ScaleTooltip({
  active,
  payload,
  source,
  target,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: ScaleChartPoint }>;
  source: string;
  target: string;
}) {
  const point = payload?.[0]?.payload;

  if (!active || !point) {
    return null;
  }

  return (
    <div className="max-w-72 rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-lg">
      <p className="font-semibold text-slate-950">{formatMoney(point.amount, source)} sent</p>
      <p className="mt-1 text-slate-600">
        {point.delivered === null ? "No viable route" : `${formatMoney(point.delivered, target)} delivered`}
      </p>
      <p className="mt-2 text-slate-500">Winner</p>
      <p className="font-medium text-slate-800">{point.label}</p>
      {point.deliveredPerSource !== null ? (
        <p className="mt-2 text-slate-500">
          {formatNumber(point.deliveredPerSource, 6)} {target} per {source}
        </p>
      ) : null}
      {point.routeChanged ? (
        <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 font-semibold text-amber-800">
          Route switches at this size
        </p>
      ) : null}
    </div>
  );
}

function GraphPanel({
  routes,
  bestRoute,
}: {
  routes: RouteQuote[];
  bestRoute: RouteQuote | null;
}) {
  const { nodes, edges } = useMemo(() => buildGraph(routes, bestRoute), [bestRoute, routes]);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <SectionHeader
        icon={<GitBranch className="h-4 w-4" aria-hidden />}
        title="Route graph"
        detail="Best path highlighted"
      />
      <div className="mt-4 h-80 overflow-hidden rounded-lg border border-slate-200">
        {nodes.length > 0 ? (
          <ReactFlow
            colorMode="light"
            edgeTypes={graphEdgeTypes}
            edges={edges}
            fitView
            maxZoom={1.4}
            minZoom={0.4}
            nodes={nodes}
            nodesDraggable={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#dbe3ee" gap={18} />
            <Controls showInteractive={false} />
          </ReactFlow>
        ) : (
          <EmptyState message="Run a quote to visualize route candidates." />
        )}
      </div>
    </section>
  );
}

function buildGraph(routes: RouteQuote[], bestRoute: RouteQuote | null): { nodes: Node[]; edges: Edge[] } {
  const currenciesInOrder = Array.from(new Set(routes.flatMap((route) => route.path)));
  const maxDepthByCurrency = new Map<string, number>();

  for (const route of routes) {
    route.path.forEach((currency, index) => {
      maxDepthByCurrency.set(currency, Math.max(maxDepthByCurrency.get(currency) ?? 0, index));
    });
  }

  const nodes = currenciesInOrder.map((currency, index) => ({
    id: currency,
    position: {
      x: (maxDepthByCurrency.get(currency) ?? 0) * 180,
      y: index * 70,
    },
    data: { label: currency },
  }));

  const bestLegByPair = new Map(
    bestRoute?.legs.map((leg) => [`${leg.from}-${leg.to}`, leg.providerName]) ?? [],
  );

  const graphEdges = new Map<
    string,
    {
      source: string;
      target: string;
      bestProvider: string | null;
      providers: string[];
    }
  >();

  for (const route of routes) {
    for (const leg of route.legs) {
      const id = `${leg.from}-${leg.to}`;
      const existing = graphEdges.get(id) ?? {
        source: leg.from,
        target: leg.to,
        bestProvider: null,
        providers: [],
      };
      if (!existing.providers.includes(leg.providerName)) {
        existing.providers.push(leg.providerName);
      }
      existing.bestProvider = bestLegByPair.get(id) ?? existing.bestProvider;
      graphEdges.set(id, existing);
    }
  }

  const edges = [...graphEdges.entries()].flatMap(([pairId, edge]) => {
    const middle = (edge.providers.length - 1) / 2;

    return edge.providers.map((provider, index) => {
      const highlighted = provider === edge.bestProvider;
      const color = highlighted ? "#0f766e" : "#64748b";
      const offset = (index - middle) * 24;

      return {
        id: `${pairId}-${provider}`,
        type: "parallelProvider",
        source: edge.source,
        target: edge.target,
        data: {
          color,
          highlighted,
          label: provider,
          offset,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color },
      };
    });
  });

  return { nodes, edges };
}

function ParallelProviderEdge({
  id,
  data,
  markerEnd,
  sourceX,
  sourceY,
  targetX,
  targetY,
}: EdgeProps) {
  const edgeData = data as ParallelEdgeData | undefined;
  const color = edgeData?.color ?? "#64748b";
  const highlighted = edgeData?.highlighted ?? false;
  const label = edgeData?.label ?? "";
  const offset = edgeData?.offset ?? 0;
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const length = Math.hypot(dx, dy) || 1;
  const normalX = -dy / length;
  const normalY = dx / length;
  const sourceOffsetX = sourceX + normalX * offset * 0.18;
  const sourceOffsetY = sourceY + normalY * offset * 0.18;
  const targetOffsetX = targetX + normalX * offset * 0.18;
  const targetOffsetY = targetY + normalY * offset * 0.18;
  const controlOffsetX = normalX * offset;
  const controlOffsetY = normalY * offset;
  const path = [
    `M ${sourceOffsetX} ${sourceOffsetY}`,
    `C ${sourceX + dx * 0.35 + controlOffsetX} ${sourceY + dy * 0.35 + controlOffsetY}`,
    `${sourceX + dx * 0.65 + controlOffsetX} ${sourceY + dy * 0.65 + controlOffsetY}`,
    `${targetOffsetX} ${targetOffsetY}`,
  ].join(" ");
  const labelX = sourceX + dx * 0.5 + controlOffsetX;
  const labelY = sourceY + dy * 0.5 + controlOffsetY;

  return (
    <>
      <BaseEdge
        id={id}
        markerEnd={markerEnd}
        path={path}
        style={{
          stroke: color,
          strokeWidth: highlighted ? 3 : 1.8,
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold shadow-sm"
          style={{
            color,
            pointerEvents: "all",
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          {label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

function SkeletonRoutes() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="h-44 animate-pulse rounded-lg border border-slate-200 bg-white" />
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-32 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

function formatMoney(amount: number, currency: string) {
  return `${formatNumber(amount)} ${currency}`;
}

function formatNumber(amount: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatCompact(amount: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
}
