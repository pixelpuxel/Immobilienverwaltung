import { NextRequest, NextResponse } from "next/server";
import { documentPublicLinks } from "@/lib/document-downloads";
import { integrationDocumentVisibilityWhere } from "@/lib/integration-document-access";
import { requireIntegrationUser } from "@/lib/integration-auth";
import { canAccessDocument } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const LINK_TTL_SECONDS = 60 * 60;

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["read:documents"]);
  if (!user) return response;

  const document = await prisma.document.findFirst({
    where: { AND: [{ id: params.id }, await integrationDocumentVisibilityWhere(user)] },
    select: { id: true, title: true, filename: true, storagePath: true }
  });
  if (!document) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Dokument wurde nicht gefunden oder ist nicht freigegeben." } }, { status: 404 });
  }
  if (!document.storagePath) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Zu diesem Dokument wurde noch keine Datei hochgeladen." } }, { status: 404 });
  }

  const canDownload = user.tokenScopes.includes("download:documents") && await canAccessDocument(user, document.id, true);
  const issuedAtSeconds = Math.floor(Date.now() / 1000);
  const expiresAtSeconds = issuedAtSeconds + LINK_TTL_SECONDS;
  const links = documentPublicLinks(document.id, { absolute: true, signed: true, expiresAtSeconds });
  const expiresAt = new Date(expiresAtSeconds * 1000).toISOString();

  return NextResponse.json({
    id: document.id,
    title: document.title,
    filename: document.filename,
    issuedAt: new Date(issuedAtSeconds * 1000).toISOString(),
    expiresAt,
    expiresInSeconds: LINK_TTL_SECONDS,
    links: {
      preview: links.preview,
      thumbnail: links.thumbnail,
      download: canDownload ? links.download : null
    }
  });
}
