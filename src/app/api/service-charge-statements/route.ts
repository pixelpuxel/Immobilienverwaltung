import { AuditAction, Prisma, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, clientIp, requireApiUser } from "@/lib/auth";
import { auditLog } from "@/lib/audit";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";
import { buildServiceChargeStatementSnapshot, serviceChargeSnapshotChecksum } from "@/lib/service-charge-statement";

const createSchema = z.object({
  propertyId: z.string().min(1),
  year: z.number().int().min(2000).max(2100)
});

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const propertyId = request.nextUrl.searchParams.get("propertyId") || "";
  const year = Number(request.nextUrl.searchParams.get("year") || 0);
  const items = await prisma.serviceChargeStatement.findMany({
    where: {
      deletedAt: null,
      property: portalWhere(user),
      ...(propertyId ? { propertyId } : {}),
      ...(year ? { year } : {})
    },
    include: { property: { select: { name: true } }, createdBy: { select: { name: true, email: true } } },
    orderBy: [{ year: "desc" }, { version: "desc" }]
  });
  return NextResponse.json({ items: items.map(summary) });
}

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) {
    return NextResponse.json({ error: "CSRF-Schutz: ungueltiger Ursprung." }, { status: 403 });
  }
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Immobilie und Jahr pruefen." }, { status: 400 });
  try {
    const snapshot = await buildServiceChargeStatementSnapshot({
      user,
      propertyId: parsed.data.propertyId,
      year: parsed.data.year
    });
    const checksum = serviceChargeSnapshotChecksum(snapshot);
    const latest = await prisma.serviceChargeStatement.aggregate({
      where: { propertyId: parsed.data.propertyId, year: parsed.data.year },
      _max: { version: true }
    });
    const statement = await prisma.serviceChargeStatement.create({
      data: {
        portalInstanceId: user.portalInstanceId,
        propertyId: parsed.data.propertyId,
        year: parsed.data.year,
        version: (latest._max.version || 0) + 1,
        status: "DRAFT",
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        checksum,
        createdByUserId: user.id
      },
      include: { property: { select: { name: true } }, createdBy: { select: { name: true, email: true } } }
    });
    await auditLog({
      userId: user.id,
      action: AuditAction.PROPERTY_CHANGED,
      entity: "ServiceChargeStatement",
      entityId: statement.id,
      ipAddress: clientIp(request),
      detail: { operation: "created", propertyId: statement.propertyId, year: statement.year, version: statement.version, checksum }
    });
    return NextResponse.json(summary(statement), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Abrechnung konnte nicht erzeugt werden." }, { status: 422 });
  }
}

function summary(item: {
  id: string;
  propertyId: string;
  year: number;
  version: number;
  status: string;
  checksum: string;
  finalizedAt: Date | null;
  createdAt: Date;
  property: { name: string };
  createdBy: { name: string | null; email: string };
}) {
  return {
    id: item.id,
    propertyId: item.propertyId,
    propertyName: item.property.name,
    year: item.year,
    version: item.version,
    status: item.status,
    checksum: item.checksum,
    finalizedAt: item.finalizedAt,
    createdAt: item.createdAt,
    createdBy: item.createdBy.name || item.createdBy.email,
    pdfUrl: `/api/service-charge-statements/${item.id}/pdf`
  };
}
