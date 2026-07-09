import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createPublicShareSlug, publicShareUrl } from "@/lib/public-shares";
import { integrationError, requireIntegrationUser } from "@/lib/integration-auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  documentId: z.string().min(1),
  name: z.string().trim().optional(),
  description: z.string().trim().optional(),
  expiresDays: z.coerce.number().int().min(1).max(90).optional().default(14)
});

export async function POST(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["write:documents"]);
  if (!user) return response;
  const forbidden = requireAdmin(user);
  if (forbidden) return forbidden;

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return integrationError("BAD_REQUEST", "Bitte Freigabe-Daten pruefen.", 400);
  }

  const document = await prisma.document.findFirst({
    where: { id: parsed.data.documentId, portalInstanceId: user.portalInstanceId },
    select: { id: true, title: true, filename: true, mimeType: true, size: true, storagePath: true }
  });
  if (!document) return integrationError("NOT_FOUND", "Dokument nicht gefunden.", 404);

  const expiresAt = new Date(Date.now() + parsed.data.expiresDays * 24 * 60 * 60 * 1000);
  const share = await prisma.publicShare.create({
    data: {
      portalInstanceId: user.portalInstanceId,
      slug: createPublicShareSlug(),
      name: parsed.data.name || document.title || document.filename,
      description: parsed.data.description || `Freigabe fuer ${document.filename}`,
      expiresAt,
      createdById: user.id,
      files: {
        create: {
          sourceDocumentId: document.id,
          filename: document.filename,
          mimeType: document.mimeType,
          size: document.size,
          storagePath: document.storagePath
        }
      }
    },
    include: { files: { orderBy: { createdAt: "asc" } } }
  });

  return NextResponse.json({ share: serializeShare(share) }, { status: 201 });
}

function requireAdmin(user: { role: Role }) {
  if (user.role !== Role.ADMIN) {
    return integrationError("FORBIDDEN", "Dieser Endpunkt braucht einen Eigentuemer-Token.", 403);
  }
  return null;
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
