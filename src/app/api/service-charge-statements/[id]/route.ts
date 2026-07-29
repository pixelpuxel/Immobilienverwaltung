import { AuditAction, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, clientIp, requireApiUser } from "@/lib/auth";
import { auditLog } from "@/lib/audit";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";
import { isServiceChargeStatementSnapshot } from "@/lib/service-charge-statement";

const updateSchema = z.object({ status: z.literal("FINAL") });

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Ungueltiger Status." }, { status: 400 });
  const current = await prisma.serviceChargeStatement.findFirst({
    where: { id: params.id, deletedAt: null, property: portalWhere(user) }
  });
  if (!current) return NextResponse.json({ error: "Abrechnung nicht gefunden." }, { status: 404 });
  if (!isServiceChargeStatementSnapshot(current.snapshot)) {
    return NextResponse.json({ error: "Abrechnungssnapshot ist ungueltig." }, { status: 422 });
  }
  if (current.snapshot.allocation.blockingWarnings?.length) {
    return NextResponse.json({
      error: "Abrechnung enthaelt blockierende Pruefhinweise.",
      warnings: current.snapshot.allocation.blockingWarnings
    }, { status: 409 });
  }
  const statement = await prisma.serviceChargeStatement.update({
    where: { id: current.id },
    data: { status: "FINAL", finalizedAt: current.finalizedAt || new Date() }
  });
  await auditLog({
    userId: user.id,
    action: AuditAction.PROPERTY_CHANGED,
    entity: "ServiceChargeStatement",
    entityId: statement.id,
    ipAddress: clientIp(request),
    detail: { operation: "finalized", version: statement.version, checksum: statement.checksum }
  });
  return NextResponse.json({ id: statement.id, status: statement.status, finalizedAt: statement.finalizedAt });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const current = await prisma.serviceChargeStatement.findFirst({
    where: { id: params.id, deletedAt: null, property: portalWhere(user) }
  });
  if (!current) return NextResponse.json({ error: "Abrechnung nicht gefunden." }, { status: 404 });
  const finalConfirmed = request.nextUrl.searchParams.get("confirm") === "DELETE_FINAL";
  if (current.status === "FINAL" && !finalConfirmed) {
    return NextResponse.json({ error: "Festgeschriebene Version erfordert confirm=DELETE_FINAL." }, { status: 409 });
  }
  await prisma.serviceChargeStatement.update({ where: { id: current.id }, data: { deletedAt: new Date() } });
  await auditLog({
    userId: user.id,
    action: AuditAction.PROPERTY_CHANGED,
    entity: "ServiceChargeStatement",
    entityId: current.id,
    ipAddress: clientIp(request),
    detail: { operation: "deleted", version: current.version }
  });
  return NextResponse.json({ deleted: true });
}
