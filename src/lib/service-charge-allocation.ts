import type { ServiceChargeData } from "./banking-integration";

export const SERVICE_CHARGE_METHODS = ["AREA", "FIXED_SHARE", "EXTERNAL_STATEMENT"] as const;
export type ServiceChargeMethod = typeof SERVICE_CHARGE_METHODS[number];

export type AllocationRuleInput = {
  method: ServiceChargeMethod;
  totalDistributionValue: number | null;
  unitValues: Record<string, number>;
  statementLines?: Array<{
    unitId: string | null;
    amount: number;
    treatment: "ALLOCABLE" | "NON_ALLOCABLE" | "RESERVE";
  }>;
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
  blockingWarnings: string[];
};

export function calculateServiceChargeAllocation(
  data: ServiceChargeData,
  rule: AllocationRuleInput
): AllocationResult {
  const costs = Math.abs(toNumber(data.allocable_costs.total));
  const warnings: string[] = [];
  const blockingWarnings: string[] = [];
  const periods = normalizedTenancyPeriods(data);
  if (periods.clippedCount) {
    warnings.push(`${periods.clippedCount} historische Mietzeitraeume wurden am Beginn des jeweiligen Folgemieters begrenzt.`);
  }
  if (periods.missingStartCount) {
    warnings.push(`${periods.missingStartCount} Mietprofile ohne Einzugs- oder Vertragsbeginn wurden nicht in die Abrechnung einbezogen.`);
  }
  if (costs === 0 && Math.abs(toNumber(data.service_charge_prepayments.total)) === 0) {
    blockingWarnings.push("Es sind weder umlagefaehige Kosten noch Nebenkostenvorauszahlungen kontiert.");
  }
  if (rule.method === "EXTERNAL_STATEMENT") {
    const allocableLines = (rule.statementLines || []).filter((line) => line.treatment === "ALLOCABLE");
    const externalCosts = roundMoney(allocableLines.reduce((sum, line) => sum + Math.abs(line.amount), 0));
    const yearDays = isLeapYear(data.year) ? 366 : 365;
    const unitIds = new Set(data.units.map((unit) => unit.external_id));
    const unassignedCosts = allocableLines
      .filter((line) => !line.unitId)
      .reduce((sum, line) => sum + Math.abs(line.amount), 0);
    if (unassignedCosts && unitIds.size > 1) {
      blockingWarnings.push("Kosten fuer das Gesamtobjekt muessen bei mehreren Einheiten einer Einheit zugeordnet werden.");
    }
    const tenantResults = data.tenancies.map((tenancy) => {
      const occupiedDays = periods.daysByTenant.get(tenancy.external_id) || 0;
      const unitCosts = allocableLines
        .filter((line) => line.unitId === tenancy.unit_external_id || (!line.unitId && unitIds.size === 1))
        .reduce((sum, line) => sum + Math.abs(line.amount), 0);
      const share = occupiedDays / yearDays;
      const allocatedCosts = roundMoney(unitCosts * share);
      const actualPrepayments = roundMoney(toNumber(tenancy.actual_service_charge_prepayments));
      return {
        tenantId: tenancy.external_id,
        unitId: tenancy.unit_external_id,
        tenantName: tenancy.display_name,
        occupiedDays,
        yearDays,
        unitValue: unitCosts,
        share,
        allocatedCosts,
        actualPrepayments,
        result: roundMoney(allocatedCosts - actualPrepayments)
      };
    }).filter((item) => item.occupiedDays > 0);
    const allocatedToTenants = roundMoney(tenantResults.reduce((sum, item) => sum + item.allocatedCosts, 0));
    const totalPrepayments = roundMoney(tenantResults.reduce((sum, item) => sum + item.actualPrepayments, 0));
    if (!allocableLines.length) blockingWarnings.push("Noch keine umlagefaehigen Positionen aus der Hausverwaltungsabrechnung erfasst.");
    return {
      method: rule.method,
      allocableCosts: externalCosts,
      allocatedToTenants,
      ownerShare: roundMoney(externalCosts - allocatedToTenants),
      totalPrepayments,
      tenantResults,
      warnings,
      blockingWarnings
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
    blockingWarnings.push("Die gesamte Verteilerflaeche beziehungsweise Anteilssumme fehlt.");
  }
  const occupiedByUnit = new Map<string, number>();
  const tenantResults = data.tenancies.map((tenancy) => {
    const occupiedDays = periods.daysByTenant.get(tenancy.external_id) || 0;
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
  }).filter((item) => item.occupiedDays > 0);
  for (const [unitId, days] of occupiedByUnit) {
    if (days > yearDays) {
      blockingWarnings.push(`Einheit ${unitId} hat trotz Zeitachsenbereinigung ueberschneidende Mietzeitraeume (${days} Belegungstage).`);
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
    warnings,
    blockingWarnings
  };
}

function overlapDaysExclusive(year: number, rawStart: number, rawEndExclusive: number) {
  const yearStart = Date.UTC(year, 0, 1);
  const yearEndExclusive = Date.UTC(year + 1, 0, 1);
  const start = Math.max(yearStart, rawStart);
  const endExclusive = Math.min(yearEndExclusive, rawEndExclusive);
  if (endExclusive <= start) return 0;
  return Math.floor((endExclusive - start) / 86_400_000);
}

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value || "")) return null;
  const parsed = Date.parse(value.slice(0, 10) + "T00:00:00Z");
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedTenancyPeriods(data: ServiceChargeData) {
  const daysByTenant = new Map<string, number>();
  let clippedCount = 0;
  let missingStartCount = 0;
  const byUnit = new Map<string, typeof data.tenancies>();
  for (const tenancy of data.tenancies) {
    const group = byUnit.get(tenancy.unit_external_id) || [];
    group.push(tenancy);
    byUnit.set(tenancy.unit_external_id, group);
  }
  for (const tenancies of byUnit.values()) {
    const valid = tenancies
      .map((tenancy) => ({
        tenancy,
        start: parseDate(tenancy.move_in_date || tenancy.lease_start_date),
        endExclusive: parseDate(tenancy.move_out_date)
      }))
      .filter((item): item is typeof item & { start: number } => {
        if (item.start !== null) return true;
        missingStartCount += 1;
        daysByTenant.set(item.tenancy.external_id, 0);
        return false;
      })
      .sort((a, b) => a.start - b.start || a.tenancy.external_id.localeCompare(b.tenancy.external_id));
    valid.forEach((item, index) => {
      const nextStart = valid[index + 1]?.start ?? null;
      let endExclusive = item.endExclusive ?? Number.POSITIVE_INFINITY;
      if (nextStart !== null && nextStart < endExclusive) {
        endExclusive = nextStart;
        clippedCount += 1;
      }
      daysByTenant.set(item.tenancy.external_id, overlapDaysExclusive(data.year, item.start, endExclusive));
    });
  }
  return { daysByTenant, clippedCount, missingStartCount };
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
