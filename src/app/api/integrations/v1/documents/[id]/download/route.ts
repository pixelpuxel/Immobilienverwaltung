import { AuditAction } from "@prisma/client";
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { auditLog } from "@/lib/audit";
import { readPrivateFile } from "@/lib/files";
import { requireIntegrationUser } from "@/lib/integration-auth";
import { canAccessDocument } from "@/lib/permissions";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const requestId = crypto.randomUUID();
  const { user, response } = await requireIntegrationUser(request, ["download:documents"]);
  if (!user) return response;
  const document = await prisma.document.findFirst({ where: { id: params.id, ...portalWhere(user) } });
  if (!document || !(await canAccessDocument(user, document.id, true))) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Nicht erlaubt." } }, { status: 403 });
  if (!document.storagePath) {
    return NextResponse.json({ error: { code: "FILE_MISSING", message: "Zu diesem Dokument wurde noch keine Datei hochgeladen.", requestId } }, { status: 404 });
  }
  try {
    const body = await readPrivateFile(document.storagePath);
    await auditLog({ userId: user.id, action: AuditAction.FILE_DOWNLOADED, entity: "Document", entityId: document.id, ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "integration" });
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": document.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(document.filename)}"`,
        "Cache-Control": "private, max-age=120",
        "X-Request-Id": requestId
      }
    });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    console.error("Integration document download failed", {
      requestId,
      documentId: document.id,
      filename: document.filename,
      storagePath: document.storagePath,
      code: nodeError.code,
      message: error instanceof Error ? error.message : String(error)
    });
    const missing = nodeError.code === "ENOENT";
    return NextResponse.json({
      error: {
        code: missing ? "FILE_NOT_FOUND" : "FILE_READ_FAILED",
        message: missing ? "Die gespeicherte Datei wurde auf dem Server nicht gefunden." : "Die gespeicherte Datei konnte nicht gelesen werden.",
        requestId
      }
    }, { status: missing ? 404 : 500 });
  }
}
