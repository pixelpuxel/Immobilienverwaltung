import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { deletePrivateFile } from "@/lib/files";
import { integrationError, requireIntegrationUser } from "@/lib/integration-auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["write:documents"]);
  if (!user) return response;
  const forbidden = requireAdmin(user);
  if (forbidden) return forbidden;

  const share = await prisma.publicShare.findFirst({ where: { id: params.id, portalInstanceId: user.portalInstanceId } });
  if (!share) return integrationError("NOT_FOUND", "Freigabe nicht gefunden.", 404);
  await prisma.publicShare.update({ where: { id: share.id }, data: { revokedAt: new Date() } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["write:documents"]);
  if (!user) return response;
  const forbidden = requireAdmin(user);
  if (forbidden) return forbidden;

  const share = await prisma.publicShare.findFirst({
    where: { id: params.id, portalInstanceId: user.portalInstanceId },
    include: { files: true }
  });
  if (!share) return integrationError("NOT_FOUND", "Freigabe nicht gefunden.", 404);

  for (const file of share.files) {
    if (!file.sourceDocumentId) await deletePrivateFile(file.storagePath);
  }
  await prisma.publicShare.delete({ where: { id: share.id } });
  return NextResponse.json({ ok: true });
}

function requireAdmin(user: { role: Role }) {
  if (user.role !== Role.ADMIN) {
    return integrationError("FORBIDDEN", "Dieser Endpunkt braucht einen Eigentuemer-Token.", 403);
  }
  return null;
}
