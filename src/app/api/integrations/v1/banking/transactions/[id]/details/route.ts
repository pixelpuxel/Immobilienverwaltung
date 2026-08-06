import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { BankingApiError, loadBankingTransactionDetails } from "@/lib/banking-integration";
import { integrationError, requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

const paramsSchema = z.object({
  id: z.coerce.number().int().positive()
});

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["read:properties"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;

  const parsed = paramsSchema.safeParse(params);
  if (!parsed.success) return integrationError("BAD_REQUEST", "Ungueltige Buchungs-ID.", 400);

  try {
    const details = await loadBankingTransactionDetails({
      portalInstanceId: user.portalInstanceId,
      transactionId: parsed.data.id
    });
    await enrichPortalReferences(details, user);
    return NextResponse.json(details);
  } catch (error) {
    if (error instanceof BankingApiError) {
      const status = error.status === 404 ? 404 : error.status === 403 ? 403 : 502;
      const code = error.status === 404 ? "TRANSACTION_NOT_FOUND" : error.status === 403 ? "ACCESS_DENIED" : "BANKING_ERROR";
      return integrationError(code, error.message, status);
    }
    return integrationError("BANKING_ERROR", error instanceof Error ? error.message : "Banking-Buchung konnte nicht geladen werden.", 502);
  }
}

async function enrichPortalReferences(details: Record<string, unknown>, user: NonNullable<Awaited<ReturnType<typeof requireIntegrationUser>>["user"]>) {
  const splits = Array.isArray(details.splits) ? details.splits.filter((split): split is Record<string, unknown> => Boolean(split) && typeof split === "object") : [];
  const propertyIds = uniqueIds(splits.flatMap((split) => [entityId(split.property), split.property_external_id]));
  const unitIds = uniqueIds(splits.flatMap((split) => [entityId(split.unit), split.unit_external_id]));
  const tenantIds = uniqueIds(splits.flatMap((split) => [entityId(split.tenant), split.tenant_external_id]));

  const [properties, units, tenants] = await Promise.all([
    propertyIds.length
      ? prisma.property.findMany({ where: { id: { in: propertyIds }, ...portalWhere(user) }, select: { id: true, name: true, address: true } })
      : Promise.resolve([]),
    unitIds.length
      ? prisma.unit.findMany({ where: { id: { in: unitIds }, property: portalWhere(user) }, select: { id: true, unitNumber: true, propertyId: true } })
      : Promise.resolve([]),
    tenantIds.length
      ? prisma.tenantProfile.findMany({
          where: { id: { in: tenantIds }, unit: { property: portalWhere(user) } },
          select: { id: true, firstName: true, lastName: true, unitId: true, isCurrent: true }
        })
      : Promise.resolve([])
  ]);

  const propertyById = new Map(properties.map((property) => [property.id, property]));
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const tenantById = new Map(tenants.map((tenant) => [tenant.id, tenant]));

  for (const split of splits) {
    const property = propertyById.get(entityId(split.property) || String(split.property_external_id || ""));
    if (property) split.property = { id: property.id, name: property.name, address: property.address };
    const unit = unitById.get(entityId(split.unit) || String(split.unit_external_id || ""));
    if (unit) split.unit = { id: unit.id, name: unit.unitNumber, propertyId: unit.propertyId };
    const tenant = tenantById.get(entityId(split.tenant) || String(split.tenant_external_id || ""));
    if (tenant) split.tenant = { id: tenant.id, name: [tenant.firstName, tenant.lastName].filter(Boolean).join(" "), unitId: tenant.unitId, isCurrent: tenant.isCurrent };
  }

  details.property = uniqueEntityFromSplits(splits, "property") ?? details.property ?? null;
  details.unit = uniqueEntityFromSplits(splits, "unit") ?? details.unit ?? null;
  details.tenant = uniqueEntityFromSplits(splits, "tenant") ?? details.tenant ?? null;
}

function uniqueIds(values: unknown[]) {
  return Array.from(new Set(values.map((value) => typeof value === "string" ? value.trim() : "").filter(Boolean)));
}

function entityId(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const entity = value as { id?: unknown };
  return typeof entity.id === "string" ? entity.id : "";
}

function uniqueEntityFromSplits(splits: Record<string, unknown>[], key: "property" | "unit" | "tenant") {
  const entities = splits.map((split) => split[key]).filter((value) => value && typeof value === "object") as Array<Record<string, unknown>>;
  const byId = new Map(entities.map((entity) => [String(entity.id ?? entity.name ?? JSON.stringify(entity)), entity]));
  if (byId.size === 0) return null;
  if (byId.size === 1) return Array.from(byId.values())[0];
  return Array.from(byId.values());
}
