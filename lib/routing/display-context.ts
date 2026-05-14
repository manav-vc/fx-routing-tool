import type { RailMode } from "./types";

export interface QuoteDisplayInputs {
  source: string;
  target: string;
  amount: number;
  railMode: RailMode;
}

export function resolveQuoteDisplayInputs(
  draftInputs: QuoteDisplayInputs,
  quotedInputs: QuoteDisplayInputs | null,
): QuoteDisplayInputs {
  return quotedInputs ?? draftInputs;
}
