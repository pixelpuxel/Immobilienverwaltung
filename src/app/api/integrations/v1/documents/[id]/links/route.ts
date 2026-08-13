import { NextRequest, NextResponse } from "next/server";
import { documentPublicLinks } from "@/lib/document-downloads";
import { integrationDocumentVisibilityWhere } from "@/lib/integration-document-access";
import { requireIntegrationUser } from "@/lib/integration-auth";
import { canAccessDocument } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const LINK_TTL_SECONDS = 30 * 24 * 60 * 60;

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
  const links = documentPublicLinks(document.id, { absolute: true, signed: true, expiresInSeconds: LINK_TTL_SECONDS });
  const expiresAt = new Date(Date.now() + LINK_TTL_SECONDS * 1000).toISOString();

  return NextResponse.json({
    id: document.id,
    title: document.title,
    filename: document.filename,
    expiresAt,
    links: {
      preview: links.preview,
      thumbnail: links.thumbnail,
      download: canDownload ? links.download : null
    }
  });
}
