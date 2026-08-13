import { describe, expect, it } from "vitest";
import type { ServiceChargeData } from "../src/lib/banking-integration";
import { calculateServiceChargeAllocation } from "../src/lib/service-charge-allocation";

function fixture(overrides?: Partial<ServiceChargeData>): ServiceChargeData {
  return {
    property: { external_id: "property-1", name: "Tirolergasse", address: "Tirolergasse 1" },
    year: 2025,
    units: [
      { external_id: "unit-1", name: "Zimmer 1", floor: "1", living_area: "20", is_shared_housing: true },
      { external_id: "unit-2", name: "Zimmer 2", floor: "1", living_area: "40", is_shared_housing: true }
    ],
    tenancies: [
      {
        external_id: "tenant-1",
        unit_external_id: "unit-1",
        display_name: "Mieter Eins",
        lease_start_date: "2025-01-01",
        move_in_date: "2025-01-01",
        move_out_date: "",
        rent_amount: "500",
        garage_rent: "0",
        service_charges: "100",
        stepped_rent: null,
        actual_service_charge_prepayments: "100"
      },
      {
        external_id: "tenant-2",
        unit_external_id: "unit-2",
        display_name: "Mieter Zwei",
        lease_start_date: "2025-01-01",
        move_in_date: "2025-01-01",
        move_out_date: "",
        rent_amount: "700",
        garage_rent: "0",
        service_charges: "200",
        stepped_rent: null,
        actual_service_charge_prepayments: "200"
      }
    ],
    allocable_costs: { total: "-1200", items: [] },
    service_charge_prepayments: { total: "300", items: [] },
    service_charge_settlements: { total: "0", items: [] },
    cold_rent: { total: "0", items: [] },
    allocation: { owner: "immobilienportal", note: "Portal verteilt." },
    ...overrides
  };
}

describe("service charge allocation", () => {
  it("allocates full-year WG costs by area without shifting an owner share", () => {
    const result = calculateServiceChargeAllocation(fixture(), {
      method: "AREA",
      totalDistributionValue: 60,
      unitValues: { "unit-1": 20, "unit-2": 40 }
    });
    expect(result.tenantResults.map((item) => item.allocatedCosts)).toEqual([400, 800]);
    expect(result.tenantResults.map((item) => item.result)).toEqual([300, 600]);
    expect(result.ownerShare).toBe(0);
  });

  it("keeps vacancy with the owner instead of reallocating it to other tenants", () => {
    const data = fixture();
    data.tenancies[0].move_in_date = "2025-07-01";
    const result = calculateServiceChargeAllocation(data, {
      method: "AREA",
      totalDistributionValue: 60,
      unitValues: { "unit-1": 20, "unit-2": 40 }
    });
    expect(result.tenantResults[0].occupiedDays).toBe(184);
    expect(result.allocatedToTenants).toBeLessThan(1200);
    expect(result.ownerShare).toBeGreaterThan(0);
    expect(result.allocatedToTenants + result.ownerShare).toBe(1200);
  });

  it("supports a fixed 50/50 key", () => {
    const result = calculateServiceChargeAllocation(fixture(), {
      method: "FIXED_SHARE",
      totalDistributionValue: 100,
      unitValues: { "unit-1": 50, "unit-2": 50 }
    });
    expect(result.tenantResults.map((item) => item.allocatedCosts)).toEqual([600, 600]);
  });

  it("clips an older tenant at the following move-in date", () => {
    const data = fixture();
    data.tenancies = [
      { ...data.tenancies[0], external_id: "old", move_in_date: "2023-01-01", move_out_date: "2025-12-31" },
      { ...data.tenancies[0], external_id: "new", move_in_date: "2025-10-01", move_out_date: "" }
    ];
    const result = calculateServiceChargeAllocation(data, {
      method: "AREA",
      totalDistributionValue: 20,
      unitValues: { "unit-1": 20 }
    });
    expect(result.tenantResults.map((item) => item.occupiedDays)).toEqual([273, 92]);
    expect(result.allocatedToTenants).toBe(1200);
    expect(result.blockingWarnings).toEqual([]);
    expect(result.warnings[0]).toContain("Folgemieters");
  });

  it("uses only allocable external statement lines and ignores bank house-money payments", () => {
    const result = calculateServiceChargeAllocation(fixture(), {
      method: "EXTERNAL_STATEMENT",
      totalDistributionValue: null,
      unitValues: {},
      statementLines: [
        { unitId: "unit-1", amount: 300, treatment: "ALLOCABLE" },
        { unitId: "unit-2", amount: 600, treatment: "ALLOCABLE" },
        { unitId: "unit-1", amount: 100, treatment: "NON_ALLOCABLE" },
        { unitId: "unit-2", amount: 200, treatment: "RESERVE" }
      ]
    });
    expect(result.allocableCosts).toBe(900);
    expect(result.tenantResults.map((item) => item.allocatedCosts)).toEqual([300, 600]);
    expect(result.ownerShare).toBe(0);
  });
});
