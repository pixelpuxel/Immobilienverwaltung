import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { buildDocumentExportZip } from "@/lib/document-export-zip";
import { savePrivateBuffer } from "@/lib/files";
import { createPublicShareSlug, publicShareUrl } from "@/lib/public-shares";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });

  const zip = await buildDocumentExportZip(params.id, user);
  if ("error" in zip) return NextResponse.json({ error: zip.error }, { status: zip.status });

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
      files: {
        create: {
          filename: saved.filename,
          mimeType: saved.mimeType,
          size: saved.size,
          storagePath: saved.storagePath
        }
      }
    },
    include: { files: true }
  });
  await prisma.documentExport.update({ where: { id: zip.documentExport.id }, data: { downloadedAt: new Date() } });

  return NextResponse.json({ share: { ...share, url: publicShareUrl(share.slug) } }, { status: 201 });
}
