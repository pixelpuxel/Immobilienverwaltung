import { AuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auditLog } from "@/lib/audit";
import { requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

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
