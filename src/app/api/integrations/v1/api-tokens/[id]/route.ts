import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { integrationError, requireIntegrationUser } from "@/lib/integration-auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["write:settings"]);
  if (!user) return response;
  const forbidden = requireAdmin(user);
  if (forbidden) return forbidden;

  const token = await prisma.apiToken.findFirst({ where: { id: params.id, user: portalWhere(user) } });
  if (!token) {
    return integrationError("NOT_FOUND", "Token nicht gefunden.", 404);
  }

  await prisma.apiToken.update({ where: { id: params.id }, data: { revokedAt: new Date() } });
  return NextResponse.json({ ok: true });
}

function requireAdmin(user: { role: Role }) {
  if (user.role !== Role.ADMIN) {
    return integrationError("FORBIDDEN", "Dieser Endpunkt braucht einen Eigentuemer-Token.", 403);
  }
  return null;
}
