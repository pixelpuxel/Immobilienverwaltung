import { describe, expect, it } from "vitest";
import { propertyUpdateSchema } from "../src/lib/property-schema";

describe("propertyUpdateSchema", () => {
  it("accepts purchasePrice as writable field without mixing it with expectedPurchasePrice", () => {
    const result = propertyUpdateSchema.safeParse({
      purchasePrice: "123456.78",
      expectedPurchasePrice: "234567.89"
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.purchasePrice).toBe(123456.78);
    expect(result.data.expectedPurchasePrice).toBe(234567.89);
  });
});
