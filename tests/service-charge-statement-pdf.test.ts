import { describe, expect, it } from "vitest";
import type { ServiceChargeLine } from "../src/lib/banking-integration";
import { serviceChargeTenantResult, type ServiceChargeStatementSnapshot } from "../src/lib/service-charge-statement";
import { renderServiceChargeStatementPdf, serviceChargeStatementPdfFilename } from "../src/lib/service-charge-statement-pdf";

const snapshot: ServiceChargeStatementSnapshot = {
  schemaVersion: 2,
  generatedAt: "2026-07-29T00:00:00.000Z",
  property: { id: "property-1", name: "Tirolergasse 14", address: "Tirolergasse 14, Konstanz" },
  year: 2025,
  method: "AREA",
  rule: { totalDistributionValue: 60.6, note: "WG-Zimmer", unitValues: { "unit-1": 18.4 } },
  statementLines: [{
    id: "line-1",
    unitId: "unit-1",
    unitName: "Zimmer 1",
    description: "Heizkostenabrechnung Minol",
    amount: 1200,
    treatment: "NICHT_UMLAGEFAEHIG_MIETER",
    sourceReference: "cmscrl5i40003czdk60lcszvm:Minol RC5 Abrechnung",
    note: null
  }],
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
  source: {
    bankingYear: 2025,
    allocableBankCosts: -1200,
    actualPrepayments: 1000,
    settlements: 0,
    coldRent: 6000,
    bankingDetails: {
      generatedAt: "2026-07-29T00:00:00.000Z",
      allocationNote: "Banking liefert Ist-Daten.",
      units: [{ external_id: "unit-1", name: "Zimmer 1", floor: "1", living_area: "18.4", is_shared_housing: true }],
      tenancies: [{
        external_id: "tenant-1",
        unit_external_id: "unit-1",
        display_name: "Max Beispiel",
        lease_start_date: "2025-01-01",
        move_in_date: "2025-01-01",
        move_out_date: "",
        rent_amount: "500",
        garage_rent: "0",
        service_charges: "100",
        stepped_rent: null,
        actual_service_charge_prepayments: "1000"
      }],
      allocableCosts: [bankingLine({ applicant_name: "Stadtwerke Konstanz", purpose: "Gas Tirolergasse", amount: "-1200" })],
      serviceChargePrepayments: [bankingLine({ applicant_name: "Max Beispiel", purpose: "Miete Januar", amount: "100", accounting_role: "service_charge_prepayment" })],
      serviceChargeSettlements: [],
      coldRent: [bankingLine({ applicant_name: "Max Beispiel", purpose: "Miete Januar", amount: "500", accounting_role: "cold_rent" })]
    }
  }
};

function bankingLine(overrides: Partial<ServiceChargeLine>): ServiceChargeLine {
  return {
    id: 1,
    transaction_id: 42,
    booking_date: "2025-01-03",
    value_date: "2025-01-03",
    amount: "0",
    transaction_amount: "600",
    currency: "EUR",
    bank_name: "Postbank",
    account_name: "Mietkonto",
    account_iban: "DE001234",
    account_bic: "TESTDEFF",
    account_number: "1234",
    applicant_name: "",
    applicant_iban: "",
    applicant_bic: "",
    purpose: "",
    memo: "",
    transaction_code: "TRANSFER",
    bank_reference: "BANK-REF-42",
    customer_reference: "CUSTOMER-42",
    tx_note: "",
    tx_flag: "",
    pending: false,
    bank_imported: true,
    source_type: "fints",
    source_reference: "",
    imported_at: "2025-01-03T12:00:00Z",
    category_path: "Immobilien:Nebenkosten",
    contractual_cold_rent: "500",
    contractual_garage_rent: "0",
    property_external_id: "property-1",
    unit_external_id: "unit-1",
    tenant_external_id: "tenant-1",
    accounting_role: "allocable_cost",
    ...overrides
  };
}

describe("service charge statement PDF", () => {
  it("selects only an explicitly allowed tenant result", () => {
    expect(serviceChargeTenantResult(snapshot, ["tenant-1"])?.tenantName).toBe("Max Beispiel");
    expect(serviceChargeTenantResult(snapshot, ["tenant-other"])).toBeNull();
  });

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
    expect(text).toContain("Heizkostenabrechnung Minol");
    expect(text).toContain("Nicht umlagefaehig");
    expect(text).not.toContain("BANK-REF-42");
    expect(text).not.toContain("Vertrags- und Mietkontext");
    expect(text).not.toContain("cmscrl5i40003czdk60lcszvm");
    expect(text).toContain("abcdef0123");
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
    expect(pdf).toContain("Nebenkostenabrechnung 2025");
    expect(pdf).toContain("Mieter: Max Beispiel");
    expect(pdf).toContain("Kostenanteil");
    expect(pdf).toContain("Nachzahlung");
  });
});
