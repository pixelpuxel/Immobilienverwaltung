import { describe, expect, it } from "vitest";
import { decimalString, propertyFinance } from "../src/lib/property-finance";

describe("propertyFinance", () => {
  it("calculates value gain and equity from the three source values", () => {
    expect(propertyFinance({
      purchasePrice: "150000.00",
      expectedPurchasePrice: "403000.00",
      outstandingLoan: "274000.00"
    })).toEqual({
      purchasePrice: 150000,
      expectedPurchasePrice: 403000,
      outstandingLoan: 274000,
      valueGain: 253000,
      equity: 129000
    });
  });

  it("does not turn missing values into zero", () => {
    expect(propertyFinance({ expectedPurchasePrice: "350000" })).toEqual({
      purchasePrice: null,
      expectedPurchasePrice: 350000,
      outstandingLoan: null,
      valueGain: null,
      equity: null
    });
  });

  it("serializes derived decimal values for APIs", () => {
    expect(decimalString(176651.3415)).toBe("176651.34");
    expect(decimalString(null)).toBeNull();
  });
});
