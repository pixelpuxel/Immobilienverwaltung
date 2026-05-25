import { AuditAction, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { assertSameOrigin, clientIp, requireApiUser } from "@/lib/auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  userId: z.string(),
  documentId: z.string(),
  canView: z.boolean().default(true),
  canDownload: z.boolean().default(false)
});

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Ungueltige Daten." }, { status: 400 });
  const [targetUser, document] = await Promise.all([
    prisma.user.findFirst({ where: { id: body.data.userId, ...portalWhere(user) }, select: { id: true } }),
    prisma.document.findFirst({ where: { id: body.data.documentId, ...portalWhere(user) }, select: { id: true } })
  ]);
  if (!targetUser || !document) return NextResponse.json({ error: "Benutzer oder Dokument gehoert nicht zu dieser Instanz." }, { status: 403 });
  const permission = await prisma.accessPermission.upsert({
    where: { userId_documentId: { userId: body.data.userId, documentId: body.data.documentId } },
    update: { canView: body.data.canView, canDownload: body.data.canDownload },
    create: body.data
  });
  await auditLog({ userId: user.id, action: AuditAction.PERMISSION_CHANGED, entity: "AccessPermission", entityId: permission.id, ipAddress: clientIp(request), detail: body.data });
  return NextResponse.json(permission);
}
