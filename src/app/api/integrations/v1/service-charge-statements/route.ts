import { AuditAction, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";
import { buildServiceChargeStatementSnapshot, serviceChargeSnapshotChecksum } from "@/lib/service-charge-statement";

const createSchema = z.object({
  propertyId: z.string().min(1),
  year: z.number().int().min(2000).max(2100)
});

export async function GET(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["read:properties"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;
  const propertyId = request.nextUrl.searchParams.get("propertyId") || "";
  const year = Number(request.nextUrl.searchParams.get("year") || 0);
  const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || 30)));
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
