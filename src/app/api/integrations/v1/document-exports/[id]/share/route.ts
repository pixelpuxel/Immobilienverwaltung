import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { buildDocumentExportZip } from "@/lib/document-export-zip";
import { savePrivateBuffer } from "@/lib/files";
import { integrationError, requireIntegrationUser } from "@/lib/integration-auth";
import { createPublicShareSlug, publicShareUrl } from "@/lib/public-shares";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["write:documents"]);
  if (!user) return response;
  const forbidden = requireAdmin(user);
  if (forbidden) return forbidden;

  const zip = await buildDocumentExportZip(params.id, user);
  if ("error" in zip) return integrationError("BAD_REQUEST", zip.error || "Export konnte nicht erstellt werden.", zip.status || 400);

  const saved = await savePrivateBuffer(zip.filename, Buffer.from(zip.data), "application/zip");
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const share = await prisma.publicShare.create({
    data: {
      portalInstanceId: user.portalInstanceId,
      slug: createPublicShareSlug(),
      name: zip.documentExport.name,
      description: zip.documentExport.description || `Dokumentenexport ${zip.documentExport.name}`,
      expiresAt,
      createdById: user.id,
      files: { create: { filename: saved.filename, mimeType: saved.mimeType, size: saved.size, storagePath: saved.storagePath } }
    },
    include: { files: true }
  });
  await prisma.documentExport.update({ where: { id: zip.documentExport.id }, data: { downloadedAt: new Date() } });
  return NextResponse.json({ share: { ...share, url: publicShareUrl(share.slug) } }, { status: 201 });
}

function requireAdmin(user: { role: Role }) {
  if (user.role !== Role.ADMIN) {
    return integrationError("FORBIDDEN", "Dieser Endpunkt braucht einen Eigentuemer-Token.", 403);
  }
  return null;
}
