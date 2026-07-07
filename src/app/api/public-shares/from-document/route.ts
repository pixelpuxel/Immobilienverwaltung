import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { createPublicShareSlug, publicShareUrl } from "@/lib/public-shares";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  documentId: z.string().min(1),
  name: z.string().trim().optional(),
  description: z.string().trim().optional(),
  expiresDays: z.coerce.number().int().min(1).max(90).optional().default(14)
});

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Bitte Eingaben prüfen.", issues: parsed.error.issues }, { status: 400 });

  const document = await prisma.document.findFirst({
    where: { id: parsed.data.documentId, portalInstanceId: user.portalInstanceId },
    select: { id: true, title: true, filename: true, mimeType: true, size: true, storagePath: true }
  });
  if (!document) return NextResponse.json({ error: "Dokument nicht gefunden." }, { status: 404 });

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
    include: { files: true }
  });

  return NextResponse.json({ share: { ...share, url: publicShareUrl(share.slug) } }, { status: 201 });
}
