import { AuditAction, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { clientIp } from "@/lib/auth";
import { integrationError, requireIntegrationUser } from "@/lib/integration-auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  userId: z.string(),
  documentId: z.string(),
  canView: z.boolean().default(true),
  canDownload: z.boolean().default(false)
});

export async function POST(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["write:documents"]);
  if (!user) return response;
  if (user.role !== Role.ADMIN) return integrationError("FORBIDDEN", "Dieser Endpunkt braucht einen Eigentuemer-Token.", 403);

  const body = schema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return integrationError("BAD_REQUEST", "Ungueltige Freigabe-Daten.", 400);

  const [targetUser, document] = await Promise.all([
    prisma.user.findFirst({ where: { id: body.data.userId, ...portalWhere(user) }, select: { id: true } }),
    prisma.document.findFirst({ where: { id: body.data.documentId, ...portalWhere(user) }, select: { id: true } })
  ]);
  if (!targetUser || !document) return integrationError("FORBIDDEN", "Benutzer oder Dokument gehoert nicht zu dieser Instanz.", 403);

  const permission = await prisma.accessPermission.upsert({
    where: { userId_documentId: { userId: body.data.userId, documentId: body.data.documentId } },
    update: { canView: body.data.canView, canDownload: body.data.canDownload },
    create: body.data,
    include: { user: { select: { id: true, email: true, username: true, name: true, role: true } } }
  });
  await auditLog({ userId: user.id, action: AuditAction.PERMISSION_CHANGED, entity: "AccessPermission", entityId: permission.id, ipAddress: clientIp(request), detail: body.data });

  return NextResponse.json({
    id: permission.id,
    userId: permission.userId,
    documentId: permission.documentId,
    canView: permission.canView,
    canDownload: permission.canDownload,
    user: permission.user
  });
}
