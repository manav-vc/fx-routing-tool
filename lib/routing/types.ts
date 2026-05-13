export type ProviderType = "fiat_broker" | "stablecoin_venue";
export type Rail = "fiat" | "stablecoin";
export type RailMode = "all" | "fiat_only";
export type ProviderState = "available" | "degraded" | "unavailable";

export interface FeeModel {
  fee_percent: number;
  fee_flat: number;
  fee_currency: "source";
}

export interface StaticPair {
  from: string;
  to: string;
  rate: number;
}

export interface ProviderConfig {
  name: string;
  type: ProviderType;
  rate_source: "live_api" | "static";
  api?: {
    endpoint: string;
    docs: string;
  };
  fee_model: FeeModel;
  pairs?: StaticPair[];
}

export interface ProvidersFile {
  providers: ProviderConfig[];
}

export interface QuoteEdge {
  from: string;
  to: string;
  providerName: string;
  providerType: ProviderType;
  rail: Rail;
  rate: number;
  feePercent: number;
  feeFlat: number;
  feeCurrency: "source";
}

export interface RouteLegQuote extends QuoteEdge {
  inputAmount: number;
  feeAmount: number;
  netAmount: number;
  outputAmount: number;
}

export interface RouteQuote {
  id: string;
  path: string[];
  legs: RouteLegQuote[];
  finalAmount: number;
  isDirect: boolean;
  directDifferenceAmount: number | null;
  directDifferencePercent: number | null;
}

export interface ProviderStatus {
  providerName: string;
  state: ProviderState;
  message: string;
  quotedPairs: number;
  latencyMs: number;
}

export interface ScalePoint {
  amount: number;
  bestRouteId: string | null;
  bestRouteLabel: string | null;
  finalAmount: number | null;
}

export interface QuoteResponse {
  routes: RouteQuote[];
  directRoute: RouteQuote | null;
  providerStatus: ProviderStatus[];
  scaleAnalysis: ScalePoint[];
  generatedAt: string;
}
