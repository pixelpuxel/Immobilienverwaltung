import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { integrationError, requireIntegrationUser } from "@/lib/integration-auth";
import { saveUpload } from "@/lib/files";
import { resolveIntegrationUploadFile, type ResolvedIntegrationUploadFile } from "@/lib/integration-upload";
import { createPublicShareSlug, publicShareUrl } from "@/lib/public-shares";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request);
  if (!user) return response;
  const forbidden = requireAdmin(user);
  if (forbidden) return forbidden;

  const shares = await prisma.publicShare.findMany({
    where: { portalInstanceId: user.portalInstanceId },
    include: { files: { orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "desc" },
    take: 100
  });

  return NextResponse.json({ items: shares.map(serializeShare), nextCursor: null });
}

export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || randomUUID();
  try {
    const { user, response } = await requireIntegrationUser(request, ["write:documents"]);
    if (!user) return response;
    const forbidden = requireAdmin(user);
    if (forbidden) return forbidden;

    const body = await request.json().catch(() => ({}));
    if (!body || typeof body !== "object") return publicShareError("BAD_REQUEST", "Bitte Freigabe-Daten pruefen.", requestId, 400);
    const data = body as Record<string, unknown>;
    const files = await resolveShareFiles(data);
    if (!files.length) return publicShareError("FILE_ARGUMENT_MISSING", "Dateiargument fehlt.", requestId, 400);

    const expiresDays = numberValue(data.expiresDays, 14);
    if (expiresDays < 1 || expiresDays > 90) return publicShareError("BAD_REQUEST", "expiresDays muss zwischen 1 und 90 liegen.", requestId, 400);
    const expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000);
    const name = textValue(data.name) || textValue(data.title) || "Dateifreigabe";
    const description = textValue(data.description);
    const savedFiles = await Promise.all(files.map((upload) => saveUpload(upload.file)));
    const share = await prisma.publicShare.create({
      data: {
        portalInstanceId: user.portalInstanceId,
        slug: createPublicShareSlug(),
        name,
        description,
        expiresAt,
        createdById: user.id,
        files: {
          create: savedFiles.map((file) => ({
            filename: file.filename,
            mimeType: file.mimeType,
            size: file.size,
            storagePath: file.storagePath
          }))
        }
      },
      include: { files: { orderBy: { createdAt: "asc" } } }
    });

    return NextResponse.json({ shareId: share.id, url: publicShareUrl(share.slug), files: serializeShare(share).files, expiresAt: share.expiresAt, share: serializeShare(share) }, { status: 201 });
  } catch (error) {
    console.error("PUBLIC_SHARE_UPLOAD_FAILED", { requestId, error });
    const message = error instanceof Error ? error.message : "Freigabe konnte nicht erstellt werden.";
    return publicShareError(publicShareErrorCode(message), message, requestId, publicShareErrorStatus(message));
  }
}

function requireAdmin(user: { role: Role }) {
  if (user.role !== Role.ADMIN) {
    return integrationError("FORBIDDEN", "Dieser Endpunkt braucht einen Eigentuemer-Token.", 403);
  }
  return null;
}

async function resolveShareFiles(data: Record<string, unknown>) {
  const entries = Array.isArray(data.files) && data.files.length ? data.files : [data];
  const files: ResolvedIntegrationUploadFile[] = [];
  for (const entry of entries) {
    const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    files.push(await resolveIntegrationUploadFile({
      data: entry === data ? data : item,
      filename: textValue(item.filename) || textValue(item.fileName) || textValue(data.filename) || textValue(data.fileName),
      mimeType: textValue(item.mimeType) || textValue(data.mimeType)
    }));
  }
  return files;
}

function publicShareError(code: string, message: string, requestId: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId } }, { status });
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown, fallback: number) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function publicShareErrorCode(message: string) {
  if (message.includes("Dateiargument fehlt")) return "FILE_ARGUMENT_MISSING";
  if (message.includes("Remote-Datei konnte nicht geladen werden")) return "REMOTE_FILE_FETCH_FAILED";
  if (message.includes("fileBase64 ist ungueltig")) return "INVALID_BASE64";
  if (message.includes("Datei ist leer") || message.includes("fileBase64 ist leer")) return "EMPTY_FILE";
  if (message.includes("Dateityp")) return "UNSUPPORTED_FILE_TYPE";
  if (message.includes("Datei ist zu gross")) return "FILE_TOO_LARGE";
  if (message.includes("Lokale Pfade des Clients")) return "FILE_NOT_RESOLVED";
  return "PUBLIC_SHARE_UPLOAD_FAILED";
}

function publicShareErrorStatus(message: string) {
  return publicShareErrorCode(message) === "PUBLIC_SHARE_UPLOAD_FAILED" ? 500 : 400;
}

function serializeShare(share: {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  files: {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    sourceDocumentId: string | null;
    downloadCount: number;
    lastDownloadedAt: Date | null;
    createdAt: Date;
  }[];
}) {
  return {
    id: share.id,
    slug: share.slug,
    name: share.name,
    description: share.description,
    url: publicShareUrl(share.slug),
    expiresAt: share.expiresAt,
    revokedAt: share.revokedAt,
    createdAt: share.createdAt,
    files: share.files.map((file) => ({
      id: file.id,
      filename: file.filename,
      mimeType: file.mimeType,
      size: file.size,
      sourceDocumentId: file.sourceDocumentId,
      downloadCount: file.downloadCount,
      lastDownloadedAt: file.lastDownloadedAt,
      createdAt: file.createdAt,
      downloadUrl: `/api/public-shares/public/${share.slug}/files/${file.id}`
    }))
  };
}
