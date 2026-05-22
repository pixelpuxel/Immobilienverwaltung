import { AuditAction, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auditLog } from "@/lib/audit";
import { assertSameOrigin, clientIp, requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const admin = await requireApiUser(request, [Role.ADMIN]);
  if (!admin) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  if (admin.id === params.id) return NextResponse.json({ error: "Du kannst deinen eigenen Admin-Benutzer nicht loeschen." }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: "Benutzer wurde nicht gefunden." }, { status: 404 });
  if (target.role === Role.ADMIN) return NextResponse.json({ error: "Admin-Benutzer koennen hier nicht geloescht werden." }, { status: 400 });

  await prisma.user.delete({ where: { id: target.id } });
  await auditLog({
    userId: admin.id,
    action: AuditAction.PERMISSION_CHANGED,
    entity: "User",
    entityId: target.id,
    ipAddress: clientIp(request),
    detail: { deleted: true, email: target.email, role: target.role }
  });
  return NextResponse.json({ ok: true });
}
