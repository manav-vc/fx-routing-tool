import { describe, expect, it } from "vitest";
import { resolveQuoteDisplayInputs, type QuoteDisplayInputs } from "./display-context";

const inputs = (
  source: string,
  target: string,
  amount = 1000,
): QuoteDisplayInputs => ({
  source,
  target,
  amount,
  railMode: "all",
});

describe("quote display context", () => {
  it("uses the draft form values before the first quote is generated", () => {
    const draftInputs = inputs("USD", "CAD");

    expect(resolveQuoteDisplayInputs(draftInputs, null)).toEqual(draftInputs);
  });

  it("keeps result labels tied to the last quoted inputs when the form changes", () => {
    const draftInputs = inputs("USD", "JPY");
    const quotedInputs = inputs("USD", "CAD");

    expect(resolveQuoteDisplayInputs(draftInputs, quotedInputs)).toEqual(quotedInputs);
  });
});
