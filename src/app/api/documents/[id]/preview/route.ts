import { AuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auditLog } from "@/lib/audit";
import { clientIp, requireApiUser } from "@/lib/auth";
import { readPrivateFile } from "@/lib/files";
import { canAccessDocument } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireApiUser(request);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

  const document = await prisma.document.findUnique({ where: { id: params.id } });
  if (!document || !(await canAccessDocument(user, document.id))) {
    return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  }
  if (!document.storagePath) {
    return NextResponse.json({ error: "Zu diesem Dokument wurde noch keine Datei hochgeladen." }, { status: 404 });
  }

  const body = await readPrivateFile(document.storagePath);
  await auditLog({ userId: user.id, action: AuditAction.FILE_VIEWED, entity: "Document", entityId: document.id, ipAddress: clientIp(request) });

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": document.mimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(document.filename)}"`,
      "Cache-Control": "private, max-age=120"
    }
  });
}
