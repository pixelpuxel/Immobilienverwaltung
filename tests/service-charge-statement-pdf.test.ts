import { describe, expect, it } from "vitest";
import type { ServiceChargeStatementSnapshot } from "../src/lib/service-charge-statement";
import { renderServiceChargeStatementPdf, serviceChargeStatementPdfFilename } from "../src/lib/service-charge-statement-pdf";

const snapshot: ServiceChargeStatementSnapshot = {
  schemaVersion: 1,
  generatedAt: "2026-07-29T00:00:00.000Z",
  property: { id: "property-1", name: "Tirolergasse 14", address: "Tirolergasse 14, Konstanz" },
  year: 2025,
  method: "AREA",
  rule: { totalDistributionValue: 60.6, note: "WG-Zimmer", unitValues: { "unit-1": 18.4 } },
  statementLines: [],
  allocation: {
    method: "AREA",
    allocableCosts: 1200,
    allocatedToTenants: 1200,
    ownerShare: 0,
    totalPrepayments: 1000,
    warnings: [],
    blockingWarnings: [],
    tenantResults: [{
      tenantId: "tenant-1",
      unitId: "unit-1",
      tenantName: "Max Beispiel",
      occupiedDays: 365,
      yearDays: 365,
      unitValue: 18.4,
      share: 1,
      allocatedCosts: 1200,
      actualPrepayments: 1000,
      result: 200
    }]
  },
  source: { bankingYear: 2025, allocableBankCosts: -1200, actualPrepayments: 1000, settlements: 0, coldRent: 6000 }
};

describe("service charge statement PDF", () => {
  it("renders a valid PDF with statement content and checksum", () => {
    const pdf = renderServiceChargeStatementPdf({
      snapshot,
      version: 2,
      status: "FINAL",
      checksum: "abcdef0123456789abcdef0123456789"
    });
    expect(pdf.subarray(0, 8).toString("latin1")).toBe("%PDF-1.4");
    const text = pdf.toString("latin1");
    expect(text).toContain("Nebenkostenabrechnung");
    expect(text).toContain("Max Beispiel");
    expect(text).toContain("abcdef0123456789");
  });

  it("creates a stable safe filename", () => {
    expect(serviceChargeStatementPdfFilename(snapshot, 2)).toContain("2025_V2.pdf");
  });

  it("renders an explicitly selected tenant statement", () => {
    const pdf = renderServiceChargeStatementPdf({
      snapshot,
      version: 2,
      status: "FINAL",
      checksum: "abcdef0123456789abcdef0123456789",
      tenantId: "tenant-1"
    }).toString("latin1");
    expect(pdf).toContain("Nebenkostenabrechnung - Max Beispiel");
    expect(pdf).toContain("Ihr Kostenanteil");
    expect(pdf).toContain("Nachzahlung");
  });
});
