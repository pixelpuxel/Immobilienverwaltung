import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { integrationError, requireIntegrationUser } from "@/lib/integration-auth";
import { publicShareUrl } from "@/lib/public-shares";
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
