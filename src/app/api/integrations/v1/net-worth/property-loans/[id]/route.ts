import { NextRequest, NextResponse } from "next/server";
import { requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["write:settings"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;
  const existing = await prisma.propertyLoanAccountMapping.findFirst({ where: { id: params.id, property: portalWhere(user) } });
  if (!existing) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Nicht gefunden." } }, { status: 404 });
  await prisma.propertyLoanAccountMapping.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
