import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { saveUpload } from "@/lib/files";
import { createPublicShareSlug, publicShareUrl } from "@/lib/public-shares";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  name: z.string().trim().min(1).default("Dateifreigabe"),
  description: z.string().trim().optional(),
  expiresDays: z.coerce.number().int().min(1).max(90).optional()
});

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const shares = await prisma.publicShare.findMany({
    where: { portalInstanceId: user.portalInstanceId },
    include: { files: { orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "desc" },
    take: 100
  });
  return NextResponse.json({
    shares: shares.map((share) => ({
      ...share,
      url: publicShareUrl(share.slug)
    }))
  });
}

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const form = await request.formData();
  const files = form.getAll("file").filter((item): item is File => item instanceof File && item.size > 0);
  if (!files.length) return NextResponse.json({ error: "Bitte mindestens eine Datei auswählen." }, { status: 400 });
  const parsed = createSchema.safeParse({
    name: String(form.get("name") || "Dateifreigabe"),
    description: String(form.get("description") || ""),
    expiresDays: String(form.get("expiresDays") || "14")
  });
  if (!parsed.success) return NextResponse.json({ error: "Bitte Eingaben prüfen.", issues: parsed.error.issues }, { status: 400 });
  const expiresAt = parsed.data.expiresDays ? new Date(Date.now() + parsed.data.expiresDays * 24 * 60 * 60 * 1000) : null;
  const share = await prisma.publicShare.create({
    data: {
      portalInstanceId: user.portalInstanceId,
      slug: createPublicShareSlug(),
      name: parsed.data.name,
      description: parsed.data.description || null,
      expiresAt,
      createdById: user.id
    }
  });
  for (const file of files) {
    const saved = await saveUpload(file);
    await prisma.publicShareFile.create({
      data: {
        shareId: share.id,
        filename: saved.filename,
        mimeType: saved.mimeType,
        size: saved.size,
        storagePath: saved.storagePath
      }
    });
  }
  const created = await prisma.publicShare.findUniqueOrThrow({
    where: { id: share.id },
    include: { files: { orderBy: { createdAt: "asc" } } }
  });
  return NextResponse.json({ share: { ...created, url: publicShareUrl(created.slug) } }, { status: 201 });
}
