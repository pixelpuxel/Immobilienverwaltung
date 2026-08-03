import { AuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auditLog } from "@/lib/audit";
import { requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";
import { isServiceChargeStatementSnapshot } from "@/lib/service-charge-statement";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["read:properties"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;
  const item = await prisma.serviceChargeStatement.findFirst({
    where: { id: params.id, deletedAt: null, property: portalWhere(user) },
    include: { property: { select: { id: true, name: true, address: true } }, createdBy: { select: { name: true, email: true } } }
  });
  if (!item || !isServiceChargeStatementSnapshot(item.snapshot)) {
    return NextResponse.json({ error: "Abrechnung nicht gefunden oder ungueltig." }, { status: 404 });
  }
  return NextResponse.json({
    id: item.id,
    version: item.version,
    status: item.status,
    checksum: item.checksum,
    createdAt: item.createdAt,
    finalizedAt: item.finalizedAt,
    createdBy: item.createdBy.name || item.createdBy.email,
    property: item.property,
    snapshot: item.snapshot
  });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["write:properties"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;
  const body = await request.json().catch(() => ({}));
  if (body.status !== "FINAL") return NextResponse.json({ error: "Nur FINAL wird unterstuetzt." }, { status: 400 });
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
  const item = await prisma.serviceChargeStatement.update({
    where: { id: current.id },
    data: { status: "FINAL", finalizedAt: current.finalizedAt || new Date() }
  });
  await auditLog({
    userId: user.id,
    action: AuditAction.PROPERTY_CHANGED,
    entity: "ServiceChargeStatement",
    entityId: item.id,
    detail: { operation: "finalized", source: "integration", version: item.version }
  });
  return NextResponse.json({ id: item.id, status: item.status, finalizedAt: item.finalizedAt });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["write:properties"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;
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
    detail: { operation: "deleted", source: "integration", version: current.version }
  });
  return NextResponse.json({ deleted: true });
}
