import { AuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auditLog } from "@/lib/audit";
import { readPrivateFile } from "@/lib/files";
import { requireIntegrationUser } from "@/lib/integration-auth";
import { canAccessDocument } from "@/lib/permissions";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["download:documents"]);
  if (!user) return response;
  const document = await prisma.document.findFirst({ where: { id: params.id, ...portalWhere(user) } });
  if (!document || !(await canAccessDocument(user, document.id, true))) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Nicht erlaubt." } }, { status: 403 });
  const body = await readPrivateFile(document.storagePath);
  await auditLog({ userId: user.id, action: AuditAction.FILE_DOWNLOADED, entity: "Document", entityId: document.id, ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "integration" });
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": document.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(document.filename)}"`,
      "Cache-Control": "private, max-age=120"
    }
  });
}

