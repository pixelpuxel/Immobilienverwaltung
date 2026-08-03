import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { getBankingIntegration, loadServiceChargeData } from "./banking-integration";
import { calculateServiceChargeAllocation, SERVICE_CHARGE_METHODS, type AllocationRuleInput, type ServiceChargeMethod } from "./service-charge-allocation";
import { isServiceChargeStatementSnapshot } from "./service-charge-statement";
import { portalWhere } from "./portal-instance";
import { prisma } from "./prisma";

export const serviceChargeRuleMutationSchema = z.object({
  propertyId: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  method: z.enum(SERVICE_CHARGE_METHODS),
  totalDistributionValue: z.number().positive().nullable().optional(),
  note: z.string().max(2000).optional(),
  unitValues: z.record(z.number().finite().min(0))
});

export const serviceChargeLineMutationSchema = z.object({
  propertyId: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  unitId: z.string().min(1).nullable().optional(),
  description: z.string().trim().min(1).max(300),
  amount: z.number().finite().min(0),
  treatment: z.enum(["ALLOCABLE", "NON_ALLOCABLE", "RESERVE"]),
  sourceReference: z.string().trim().max(300).optional(),
  note: z.string().trim().max(2000).optional()
});

type PortalUser = { id: string; portalInstanceId: string | null };

export async function saveServiceChargeRule(user: PortalUser, input: z.infer<typeof serviceChargeRuleMutationSchema>) {
  const property = await prisma.property.findFirst({
    where: { id: input.propertyId, ...portalWhere(user) },
    include: { units: { select: { id: true } } }
  });
  if (!property) throw new ServiceChargeWorkspaceError("Immobilie wurde nicht gefunden.", 404);
  const allowedUnitIds = new Set(property.units.map((unit) => unit.id));
  if (Object.keys(input.unitValues).some((unitId) => !allowedUnitIds.has(unitId))) {
    throw new ServiceChargeWorkspaceError("Eine Einheit gehoert nicht zur Immobilie.", 422);
  }
  return prisma.$transaction(async (tx) => {
    const saved = await tx.serviceChargeRule.upsert({
      where: { propertyId_year: { propertyId: property.id, year: input.year } },
      create: {
        portalInstanceId: user.portalInstanceId,
        propertyId: property.id,
        year: input.year,
        method: input.method,
        totalDistributionValue: input.totalDistributionValue,
        note: input.note
      },
      update: {
        method: input.method,
        totalDistributionValue: input.totalDistributionValue,
        note: input.note
      }
    });
    await tx.serviceChargeUnitAllocation.deleteMany({ where: { ruleId: saved.id } });
    const allocations = Object.entries(input.unitValues).map(([unitId, value]) => ({ ruleId: saved.id, unitId, value }));
    if (allocations.length) await tx.serviceChargeUnitAllocation.createMany({ data: allocations });
    return tx.serviceChargeRule.findUniqueOrThrow({
      where: { id: saved.id },
      include: { unitAllocations: true, statementLines: { orderBy: { createdAt: "asc" } } }
    });
  });
}

export async function createServiceChargeLine(user: PortalUser, input: z.infer<typeof serviceChargeLineMutationSchema>) {
  const rule = await prisma.serviceChargeRule.findFirst({
    where: { propertyId: input.propertyId, year: input.year, property: portalWhere(user) },
    include: { property: { include: { units: { select: { id: true } } } } }
  });
  if (!rule) throw new ServiceChargeWorkspaceError("Zuerst Verteilerschluessel speichern.", 409);
  if (input.unitId && !rule.property.units.some((unit) => unit.id === input.unitId)) {
    throw new ServiceChargeWorkspaceError("Einheit gehoert nicht zur Immobilie.", 422);
  }
  return prisma.serviceChargeStatementLine.create({
    data: {
      portalInstanceId: user.portalInstanceId,
      ruleId: rule.id,
      unitId: input.unitId || null,
      description: input.description,
      amount: input.amount,
      treatment: input.treatment,
      sourceReference: input.sourceReference || null,
      note: input.note || null
    }
  });
}

export async function deleteServiceChargeLine(user: PortalUser, id: string) {
  const line = await prisma.serviceChargeStatementLine.findFirst({
    where: { id, rule: { property: portalWhere(user) } },
    select: { id: true }
  });
  if (!line) throw new ServiceChargeWorkspaceError("Kostenposition nicht gefunden.", 404);
  await prisma.serviceChargeStatementLine.delete({ where: { id: line.id } });
}

export async function loadServiceChargeWorkspace(input: {
  user: PortalUser;
  propertyId: string;
  year: number;
  unitId?: string;
  tenantId?: string;
}) {
  const { user, propertyId, year } = input;
  const [property, savedRule, statements, sourceCategoryCandidates, sourceDocuments, config] = await Promise.all([
    prisma.property.findFirst({
      where: { id: propertyId, ...portalWhere(user) },
      include: { units: { orderBy: { unitNumber: "asc" } } }
    }),
    prisma.serviceChargeRule.findFirst({
      where: { propertyId, year, property: portalWhere(user) },
      include: { unitAllocations: true, statementLines: { orderBy: { createdAt: "asc" } } }
    }),
    prisma.serviceChargeStatement.findMany({
      where: { propertyId, year, deletedAt: null, property: portalWhere(user) },
      orderBy: { version: "desc" }
    }),
    prisma.documentCategory.findMany({
      where: {
        name: "Hausgeldabrechnungen",
        OR: [{ portalInstanceId: user.portalInstanceId }, { portalInstanceId: null }]
      },
      select: { id: true, portalInstanceId: true }
    }),
    prisma.document.findMany({
      where: {
        propertyId,
        ...portalWhere(user),
        category: { name: "Hausgeldabrechnungen" },
        OR: [
          { documentYear: year },
          { documentYear: null, title: { contains: String(year), mode: "insensitive" } },
          { documentYear: null, filename: { contains: String(year), mode: "insensitive" } }
        ]
      },
      select: { id: true, title: true, filename: true, mimeType: true, size: true, createdAt: true },
      orderBy: { createdAt: "desc" }
    }),
    getBankingIntegration(user.portalInstanceId)
  ]);
  if (!property) throw new ServiceChargeWorkspaceError("Immobilie wurde nicht gefunden.", 404);
  if (input.unitId && !property.units.some((unit) => unit.id === input.unitId)) {
    throw new ServiceChargeWorkspaceError("Einheit gehoert nicht zur Immobilie.", 422);
  }

  const rule = serviceChargeRuleInput(property, savedRule);
  let bankingData: Awaited<ReturnType<typeof loadServiceChargeData>> | null = null;
  let bankingError: string | null = null;
  if (!config?.apiTokenEncrypted) {
    bankingError = "Banking-API-Token fehlt in den Einstellungen.";
  } else {
    try {
      bankingData = await loadServiceChargeData({
        portalInstanceId: user.portalInstanceId,
        propertyId,
        year,
        unitId: input.unitId,
        tenantId: input.tenantId
      });
    } catch (error) {
      bankingError = error instanceof Error ? error.message : "Banking-Daten konnten nicht geladen werden.";
    }
  }
  const sourceCategory = sourceCategoryCandidates.find((item) => item.portalInstanceId === user.portalInstanceId)
    || sourceCategoryCandidates.find((item) => item.portalInstanceId === null)
    || null;

  return {
    property: { id: property.id, name: property.name, address: property.address },
    year,
    units: property.units.map((unit) => ({
      id: unit.id,
      name: unit.unitNumber,
      floor: unit.floor,
      livingArea: numberOrZero(unit.livingArea),
      isSharedHousing: unit.isSharedHousing
    })),
    rule: {
      saved: Boolean(savedRule),
      method: rule.method,
      totalDistributionValue: rule.totalDistributionValue,
      note: savedRule?.note || "",
      unitValues: rule.unitValues
    },
    statementLines: (savedRule?.statementLines || []).map((line) => ({
      id: line.id,
      unitId: line.unitId,
      description: line.description,
      amount: Number(line.amount),
      treatment: line.treatment,
      sourceReference: line.sourceReference,
      note: line.note
    })),
    sourceCategoryId: sourceCategory?.id || null,
    sourceDocuments: sourceDocuments.map((document) => ({
      ...document,
      createdAt: document.createdAt.toISOString(),
      previewUrl: `/api/integrations/v1/documents/${document.id}/preview`,
      downloadUrl: `/api/integrations/v1/documents/${document.id}/download`
    })),
    banking: {
      configured: Boolean(config?.apiTokenEncrypted),
      lastSuccessfulAt: config?.lastSuccessfulAt?.toISOString() || null,
      lastError: bankingError || config?.lastError || null,
      sourceBaseUrl: config?.baseUrl || null,
      data: bankingData
    },
    allocation: bankingData ? calculateServiceChargeAllocation(bankingData, rule) : null,
    statements: statements.map((statement) => ({
      id: statement.id,
      version: statement.version,
      status: statement.status,
      checksum: statement.checksum,
      createdAt: statement.createdAt.toISOString(),
      finalizedAt: statement.finalizedAt?.toISOString() || null,
      pdfUrl: `/api/integrations/v1/service-charge-statements/${statement.id}/pdf`,
      tenants: isServiceChargeStatementSnapshot(statement.snapshot)
        ? statement.snapshot.allocation.tenantResults.map((tenant) => ({
            id: tenant.tenantId,
            name: tenant.tenantName,
            pdfUrl: `/api/integrations/v1/service-charge-statements/${statement.id}/pdf?tenantId=${encodeURIComponent(tenant.tenantId)}`
          }))
        : []
    }))
  };
}

export class ServiceChargeWorkspaceError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function serviceChargeRuleInput(
  property: { name: string; units: Array<{ id: string; livingArea: Prisma.Decimal | null }> },
  savedRule: {
    method: string;
    totalDistributionValue: Prisma.Decimal | null;
    unitAllocations: Array<{ unitId: string; value: Prisma.Decimal }>;
    statementLines: Array<{ unitId: string | null; amount: Prisma.Decimal; treatment: string }>;
  } | null
): AllocationRuleInput {
  if (savedRule) {
    return {
      method: savedRule.method as ServiceChargeMethod,
      totalDistributionValue: savedRule.totalDistributionValue === null ? null : Number(savedRule.totalDistributionValue),
      unitValues: Object.fromEntries(savedRule.unitAllocations.map((item) => [item.unitId, Number(item.value)])),
      statementLines: savedRule.statementLines.map((line) => ({
        unitId: line.unitId,
        amount: Number(line.amount),
        treatment: line.treatment as "ALLOCABLE" | "NON_ALLOCABLE" | "RESERVE"
      }))
    };
  }
  const normalizedName = property.name.toLocaleLowerCase("de-DE");
  if (normalizedName.includes("tirol")) {
    const unitValues = Object.fromEntries(property.units.map((unit) => [unit.id, numberOrZero(unit.livingArea)]));
    return {
      method: "AREA",
      totalDistributionValue: Object.values(unitValues).reduce((total, value) => total + value, 0),
      unitValues,
      statementLines: []
    };
  }
  if (normalizedName.includes("mainau")) {
    const perUnit = property.units.length ? 100 / property.units.length : 0;
    return {
      method: "FIXED_SHARE",
      totalDistributionValue: 100,
      unitValues: Object.fromEntries(property.units.map((unit) => [unit.id, perUnit])),
      statementLines: []
    };
  }
  return { method: "EXTERNAL_STATEMENT", totalDistributionValue: null, unitValues: {}, statementLines: [] };
}

function numberOrZero(value: Prisma.Decimal | number | string | null | undefined) {
  return Number(value || 0);
}
