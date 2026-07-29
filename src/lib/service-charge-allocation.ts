import type { ServiceChargeData } from "./banking-integration";

export const SERVICE_CHARGE_METHODS = ["AREA", "FIXED_SHARE", "EXTERNAL_STATEMENT"] as const;
export type ServiceChargeMethod = typeof SERVICE_CHARGE_METHODS[number];

export type AllocationRuleInput = {
  method: ServiceChargeMethod;
  totalDistributionValue: number | null;
  unitValues: Record<string, number>;
};

export type TenantAllocation = {
  tenantId: string;
  unitId: string;
  tenantName: string;
  occupiedDays: number;
  yearDays: number;
  unitValue: number;
  share: number;
  allocatedCosts: number;
  actualPrepayments: number;
  result: number;
};

export type AllocationResult = {
  method: ServiceChargeMethod;
  allocableCosts: number;
  allocatedToTenants: number;
  ownerShare: number;
  totalPrepayments: number;
  tenantResults: TenantAllocation[];
  warnings: string[];
};

export function calculateServiceChargeAllocation(
  data: ServiceChargeData,
  rule: AllocationRuleInput
): AllocationResult {
  const costs = Math.abs(toNumber(data.allocable_costs.total));
  const warnings: string[] = [];
  if (rule.method === "EXTERNAL_STATEMENT") {
    return {
      method: rule.method,
      allocableCosts: costs,
      allocatedToTenants: 0,
      ownerShare: costs,
      totalPrepayments: toNumber(data.service_charge_prepayments.total),
      tenantResults: [],
      warnings: [
        "Bei externer Hausverwaltungsabrechnung werden Bank-Hausgeldzahlungen nicht verteilt. Die umlagefaehigen Einzelkosten muessen aus der Hausverwaltungsabrechnung uebernommen werden."
      ]
    };
  }
  const yearDays = isLeapYear(data.year) ? 366 : 365;
  const derivedValues = Object.fromEntries(data.units.map((unit) => [
    unit.external_id,
    rule.method === "AREA" ? toNumber(unit.living_area) : 0
  ]));
  const unitValues = { ...derivedValues, ...rule.unitValues };
  const totalDistributionValue = rule.totalDistributionValue && rule.totalDistributionValue > 0
    ? rule.totalDistributionValue
    : Object.values(unitValues).reduce((sum, value) => sum + Math.max(0, value), 0);
  if (totalDistributionValue <= 0) {
    warnings.push("Die gesamte Verteilerflaeche beziehungsweise Anteilssumme fehlt.");
  }
  const occupiedByUnit = new Map<string, number>();
  const tenantResults = data.tenancies.map((tenancy) => {
    const occupiedDays = overlapDays(
      data.year,
      tenancy.move_in_date || tenancy.lease_start_date,
      tenancy.move_out_date
    );
    occupiedByUnit.set(
      tenancy.unit_external_id,
      (occupiedByUnit.get(tenancy.unit_external_id) || 0) + occupiedDays
    );
    const unitValue = Math.max(0, unitValues[tenancy.unit_external_id] || 0);
    const share = totalDistributionValue > 0
      ? (unitValue / totalDistributionValue) * (occupiedDays / yearDays)
      : 0;
    const allocatedCosts = roundMoney(costs * share);
    const actualPrepayments = roundMoney(toNumber(tenancy.actual_service_charge_prepayments));
    return {
      tenantId: tenancy.external_id,
      unitId: tenancy.unit_external_id,
      tenantName: tenancy.display_name,
      occupiedDays,
      yearDays,
      unitValue,
      share,
      allocatedCosts,
      actualPrepayments,
      result: roundMoney(allocatedCosts - actualPrepayments)
    };
  });
  for (const [unitId, days] of occupiedByUnit) {
    if (days > yearDays) {
      warnings.push(`Einheit ${unitId} hat sich ueberschneidende Mietzeitraeume (${days} Belegungstage).`);
    }
  }
  const allocatedToTenants = roundMoney(
    tenantResults.reduce((sum, item) => sum + item.allocatedCosts, 0)
  );
  const totalPrepayments = roundMoney(
    tenantResults.reduce((sum, item) => sum + item.actualPrepayments, 0)
  );
  return {
    method: rule.method,
    allocableCosts: costs,
    allocatedToTenants,
    ownerShare: roundMoney(costs - allocatedToTenants),
    totalPrepayments,
    tenantResults,
    warnings
  };
}

function overlapDays(year: number, rawStart: string, rawEnd: string) {
  const yearStart = Date.UTC(year, 0, 1);
  const yearEnd = Date.UTC(year, 11, 31);
  const parsedStart = parseDate(rawStart) ?? yearStart;
  const parsedEnd = parseDate(rawEnd) ?? yearEnd;
  const start = Math.max(yearStart, parsedStart);
  const end = Math.min(yearEnd, parsedEnd);
  if (end < start) return 0;
  return Math.floor((end - start) / 86_400_000) + 1;
}

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value || "")) return null;
  const parsed = Date.parse(value.slice(0, 10) + "T00:00:00Z");
  return Number.isFinite(parsed) ? parsed : null;
}

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function toNumber(value: string | number | null | undefined) {
  const parsed = Number(String(value ?? "0").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
