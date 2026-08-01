import { AuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auditLog } from "@/lib/audit";
import { readPrivateFile } from "@/lib/files";
import { requireIntegrationUser } from "@/lib/integration-auth";
import { canAccessDocument } from "@/lib/permissions";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

const maxDirectDownloadBytes = 25 * 1024 * 1024;
const supportedMimeTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "image/jpeg",
  "image/png",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/csv"
]);
const supportedExtensions = new Set(["pdf", "docx", "doc", "xlsx", "xls", "jpg", "jpeg", "png", "txt", "md", "csv"]);

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["read:documents", "download:documents"]);
  if (!user) return response;

  const document = await prisma.document.findFirst({ where: { id: params.id, ...portalWhere(user) } });
  if (!document) return errorResponse("DOCUMENT_NOT_FOUND", "Das Dokument wurde nicht gefunden.", 404);
  if (!(await canAccessDocument(user, document.id, true))) return errorResponse("ACCESS_DENIED", "Kein Zugriff auf dieses Dokument.", 403);
  if (!document.storagePath) return errorResponse("FILE_MISSING", "Zu diesem Dokument ist keine Datei gespeichert.", 404);
  if (document.size > maxDirectDownloadBytes) return errorResponse("FILE_TOO_LARGE", `Datei ist groesser als ${maxDirectDownloadBytes} Bytes.`, 413);

  const extension = document.filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || "";
  if (!supportedMimeTypes.has(document.mimeType) && !supportedExtensions.has(extension)) {
    return errorResponse("UNSUPPORTED_FILE_TYPE", `Dateityp ${document.mimeType || extension || "unbekannt"} wird nicht unterstuetzt.`, 415);
  }

  let body: Buffer;
  try {
    body = await readPrivateFile(document.storagePath);
  } catch {
    return errorResponse("FILE_MISSING", "Die gespeicherte Datei konnte nicht gelesen werden.", 404);
  }
  if (body.length > maxDirectDownloadBytes) return errorResponse("FILE_TOO_LARGE", `Datei ist groesser als ${maxDirectDownloadBytes} Bytes.`, 413);

  await auditLog({
    userId: user.id,
    action: AuditAction.FILE_DOWNLOADED,
    entity: "Document",
    entityId: document.id,
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "integration"
  });

  const filename = encodeRFC5987ValueChars(document.filename);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": document.mimeType || "application/octet-stream",
      "Content-Length": String(body.length),
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      "Cache-Control": "private, max-age=120"
    }
  });
}

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function encodeRFC5987ValueChars(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}
