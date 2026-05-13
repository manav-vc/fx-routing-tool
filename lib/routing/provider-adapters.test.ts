import { describe, expect, it } from "vitest";
import {
  normalizeExchangeRateApiRate,
  normalizeFawazRate,
  normalizeFrankfurterRate,
} from "./provider-adapters";

describe("provider adapters", () => {
  it("normalizes a Frankfurter rate response", () => {
    expect(
      normalizeFrankfurterRate(
        { amount: 1, base: "USD", date: "2026-05-13", rates: { JPY: 157.77 } },
        "USD",
        "JPY",
      ),
    ).toBe(157.77);
  });

  it("normalizes an ExchangeRate-API response", () => {
    expect(
      normalizeExchangeRateApiRate(
        {
          result: "success",
          provider: "https://www.exchangerate-api.com",
          base_code: "USD",
          rates: { CAD: 1.369875 },
        },
        "USD",
        "CAD",
      ),
    ).toBe(1.369875);
  });

  it("normalizes a fawaz currency-api response", () => {
    expect(
      normalizeFawazRate(
        { date: "2026-05-13", usd: { eur: 0.85207835 } },
        "USD",
        "EUR",
      ),
    ).toBe(0.85207835);
  });

  it("returns null when the provider response is malformed or missing a pair", () => {
    expect(normalizeFrankfurterRate({ rates: {} }, "USD", "JPY")).toBeNull();
    expect(normalizeExchangeRateApiRate({ result: "error" }, "USD", "CAD")).toBeNull();
    expect(normalizeFawazRate({ usd: {} }, "USD", "EUR")).toBeNull();
  });
});
