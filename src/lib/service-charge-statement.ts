import { createHash } from "node:crypto";
import { loadServiceChargeData, type ServiceChargeData } from "./banking-integration";
import { portalWhere } from "./portal-instance";
import { prisma } from "./prisma";
import {
  calculateServiceChargeAllocation,
  normalizeServiceChargeMethod,
  normalizeTreatment,
  type AllocationRuleInput,
  type ServiceChargeMethod
} from "./service-charge-allocation";

export type ServiceChargeStatementSnapshot = {
  schemaVersion: 1 | 2;
  generatedAt: string;
  property: { id: string; name: string; address: string };
  year: number;
  method: ServiceChargeMethod;
  rule: {
    totalDistributionValue: number | null;
    note: string;
    unitValues: Record<string, number>;
  };
  statementLines: Array<{
    id: string;
    unitId: string | null;
    unitName: string | null;
    description: string;
    amount: number;
    treatment: string;
    sourceReference: string | null;
    note: string | null;
  }>;
  allocation: ReturnType<typeof calculateServiceChargeAllocation>;
  source: {
    bankingYear: number;
    allocableBankCosts: number;
    actualPrepayments: number;
    settlements: number;
    coldRent: number;
    bankingDetails?: {
      generatedAt: string;
      allocationNote: string;
      units: ServiceChargeData["units"];
      tenancies: ServiceChargeData["tenancies"];
      allocableCosts: ServiceChargeData["allocable_costs"]["items"];
      serviceChargePrepayments: ServiceChargeData["service_charge_prepayments"]["items"];
      serviceChargeSettlements: ServiceChargeData["service_charge_settlements"]["items"];
      coldRent: ServiceChargeData["cold_rent"]["items"];
    };
  };
};

export async function buildServiceChargeStatementSnapshot(input: {
  user: { portalInstanceId: string | null };
  propertyId: string;
  year: number;
}) {
  const property = await prisma.property.findFirst({
    where: { id: input.propertyId, ...portalWhere(input.user) },
    include: {
      units: { select: { id: true, unitNumber: true } },
      serviceChargeRules: {
        where: { year: input.year },
        include: {
          unitAllocations: true,
          statementLines: { orderBy: [{ treatment: "asc" }, { createdAt: "asc" }] }
        }
      }
    }
  });
  if (!property) throw new Error("Immobilie wurde nicht gefunden.");
  const rule = property.serviceChargeRules[0];
  if (!rule) throw new Error("Zuerst Verteilerschluessel speichern.");
  const data = await loadServiceChargeData({
    portalInstanceId: input.user.portalInstanceId,
    propertyId: property.id,
    year: input.year
  });
  const unitNames = new Map(property.units.map((unit) => [unit.id, unit.unitNumber]));
  const statementLines = rule.statementLines.map((line) => ({
    id: line.id,
    unitId: line.unitId,
    unitName: line.unitId ? unitNames.get(line.unitId) || null : null,
    description: line.description,
    amount: Number(line.amount),
    treatment: line.treatment,
    sourceReference: line.sourceReference,
    note: line.note
  }));
  const ruleInput: AllocationRuleInput = {
    method: normalizeServiceChargeMethod(rule.method),
    totalDistributionValue: rule.totalDistributionValue === null ? null : Number(rule.totalDistributionValue),
    unitValues: Object.fromEntries(rule.unitAllocations.map((item) => [item.unitId, Number(item.value)])),
    statementLines: statementLines.map((line) => ({
      unitId: line.unitId,
      amount: line.amount,
      treatment: normalizeTreatment(line.treatment)
    }))
  };
  const snapshot: ServiceChargeStatementSnapshot = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    property: { id: property.id, name: property.name, address: property.address },
    year: input.year,
    method: ruleInput.method,
    rule: {
      totalDistributionValue: ruleInput.totalDistributionValue,
      note: rule.note || "",
      unitValues: ruleInput.unitValues
    },
    statementLines,
    allocation: calculateServiceChargeAllocation(data, ruleInput),
    source: {
      bankingYear: data.year,
      allocableBankCosts: Number(data.allocable_costs.total || 0),
      actualPrepayments: Number(data.service_charge_prepayments.total || 0),
      settlements: Number(data.service_charge_settlements.total || 0),
      coldRent: Number(data.cold_rent.total || 0),
      bankingDetails: {
        generatedAt: new Date().toISOString(),
        allocationNote: data.allocation.note,
        units: data.units,
        tenancies: data.tenancies,
        allocableCosts: data.allocable_costs.items,
        serviceChargePrepayments: data.service_charge_prepayments.items,
        serviceChargeSettlements: data.service_charge_settlements.items,
        coldRent: data.cold_rent.items
      }
    }
  };
  return snapshot;
}

export function serviceChargeSnapshotChecksum(snapshot: ServiceChargeStatementSnapshot) {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export function isServiceChargeStatementSnapshot(value: unknown): value is ServiceChargeStatementSnapshot {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ServiceChargeStatementSnapshot>;
  return (item.schemaVersion === 1 || item.schemaVersion === 2)
    && typeof item.year === "number"
    && Boolean(item.property)
    && Boolean(item.allocation);
}
