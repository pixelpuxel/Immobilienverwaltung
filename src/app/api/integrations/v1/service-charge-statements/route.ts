import { AuditAction, Prisma, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { integrationError, requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";
import { buildServiceChargeStatementSnapshot, isServiceChargeStatementSnapshot, serviceChargeSnapshotChecksum, serviceChargeTenantResult } from "@/lib/service-charge-statement";

const createSchema = z.object({
  propertyId: z.string().min(1),
  year: z.number().int().min(2000).max(2100)
});

export async function GET(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request);
  if (!user) return response;
  if (user.role === Role.ADMIN && !user.tokenScopes.includes("read:properties")) {
    return integrationError("FORBIDDEN", "Token braucht Scope: read:properties", 403);
  }
  if (user.role === Role.TENANT && !user.tokenScopes.includes("read:documents")) {
    return integrationError("FORBIDDEN", "Token braucht Scope: read:documents", 403);
  }
  if (user.role !== Role.ADMIN && user.role !== Role.TENANT) {
    return integrationError("FORBIDDEN", "Nebenkostenabrechnungen sind nur fuer Eigentuemer und den betroffenen Mieter sichtbar.", 403);
  }
  const propertyId = request.nextUrl.searchParams.get("propertyId") || "";
  const tenantId = request.nextUrl.searchParams.get("tenantId") || "";
  const year = Number(request.nextUrl.searchParams.get("year") || 0);
  const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || 30)));
  if (user.role === Role.TENANT) {
    const tenantProfiles = await prisma.tenantProfile.findMany({
      where: { userId: user.id, unit: { property: portalWhere(user) } },
      select: { id: true }
    });
    const tenantProfileIds = tenantProfiles.map((item) => item.id);
    if (!tenantProfileIds.length) return NextResponse.json({ items: [] });

    const candidates = await prisma.serviceChargeStatement.findMany({
      where: {
        deletedAt: null,
        status: "FINAL",
        property: portalWhere(user),
        ...(propertyId ? { propertyId } : {}),
        ...(year ? { year } : {})
      },
      include: { property: { select: { name: true } } },
      orderBy: [{ year: "desc" }, { version: "desc" }],
      take: 500
    });
    const items = candidates.flatMap((item) => {
      if (!isServiceChargeStatementSnapshot(item.snapshot)) return [];
      const result = serviceChargeTenantResult(item.snapshot, tenantProfileIds);
      if (!result) return [];
      return [{
        id: item.id,
        propertyId: item.propertyId,
        propertyName: item.property.name,
        year: item.year,
        version: item.version,
        status: item.status,
        checksum: item.checksum,
        createdAt: item.createdAt,
        finalizedAt: item.finalizedAt,
        tenantId: result.tenantId,
        tenantName: result.tenantName,
        allocatedCosts: result.allocatedCosts,
        actualPrepayments: result.actualPrepayments,
        result: result.result,
        pdfUrl: `/api/integrations/v1/service-charge-statements/${item.id}/pdf?tenantId=${encodeURIComponent(result.tenantId)}`
      }];
    }).slice(0, limit);
    return NextResponse.json({ items });
  }

  if (tenantId) {
    const tenant = await prisma.tenantProfile.findFirst({
      where: { id: tenantId, unit: { property: portalWhere(user) } },
      select: { id: true }
    });
    if (!tenant) return NextResponse.json({ items: [] });
    const candidates = await prisma.serviceChargeStatement.findMany({
      where: {
        deletedAt: null,
        property: portalWhere(user),
        ...(propertyId ? { propertyId } : {}),
        ...(year ? { year } : {})
      },
      include: { property: { select: { name: true } } },
      orderBy: [{ year: "desc" }, { version: "desc" }],
      take: 500
    });
    const items = candidates.flatMap((item) => {
      if (!isServiceChargeStatementSnapshot(item.snapshot)) return [];
      const result = serviceChargeTenantResult(item.snapshot, [tenant.id]);
      if (!result) return [];
      return [{
        id: item.id,
        propertyId: item.propertyId,
        propertyName: item.property.name,
        year: item.year,
        version: item.version,
        status: item.status,
        checksum: item.checksum,
        createdAt: item.createdAt,
        finalizedAt: item.finalizedAt,
        tenantId: result.tenantId,
        tenantName: result.tenantName,
        allocatedCosts: result.allocatedCosts,
        actualPrepayments: result.actualPrepayments,
        result: result.result,
        pdfUrl: `/api/integrations/v1/service-charge-statements/${item.id}/pdf?tenantId=${encodeURIComponent(result.tenantId)}`
      }];
    }).slice(0, limit);
    return NextResponse.json({ items });
  }

  const items = await prisma.serviceChargeStatement.findMany({
    where: {
      deletedAt: null,
      property: portalWhere(user),
      ...(propertyId ? { propertyId } : {}),
      ...(year ? { year } : {})
    },
    include: { property: { select: { name: true } } },
    orderBy: [{ year: "desc" }, { version: "desc" }],
    take: limit
  });
  return NextResponse.json({
    items: items.map((item) => ({
      id: item.id,
      propertyId: item.propertyId,
      propertyName: item.property.name,
      year: item.year,
      version: item.version,
      status: item.status,
      checksum: item.checksum,
      createdAt: item.createdAt,
      finalizedAt: item.finalizedAt,
      pdfUrl: `/api/integrations/v1/service-charge-statements/${item.id}/pdf`
    }))
  });
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["write:properties"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;
  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Immobilie und Jahr pruefen." }, { status: 400 });
  try {
    const snapshot = await buildServiceChargeStatementSnapshot({ user, ...parsed.data });
    const checksum = serviceChargeSnapshotChecksum(snapshot);
    const latest = await prisma.serviceChargeStatement.aggregate({
      where: { propertyId: parsed.data.propertyId, year: parsed.data.year },
      _max: { version: true }
    });
    const item = await prisma.serviceChargeStatement.create({
      data: {
        portalInstanceId: user.portalInstanceId,
        propertyId: parsed.data.propertyId,
        year: parsed.data.year,
        version: (latest._max.version || 0) + 1,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        checksum,
        createdByUserId: user.id
      }
    });
    await auditLog({
      userId: user.id,
      action: AuditAction.PROPERTY_CHANGED,
      entity: "ServiceChargeStatement",
      entityId: item.id,
      detail: { operation: "created", source: "integration", version: item.version, checksum }
    });
    return NextResponse.json({
      id: item.id,
      propertyId: item.propertyId,
      year: item.year,
      version: item.version,
      status: item.status,
      checksum: item.checksum,
      pdfUrl: `/api/integrations/v1/service-charge-statements/${item.id}/pdf`
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Abrechnung konnte nicht erzeugt werden." }, { status: 422 });
  }
}
