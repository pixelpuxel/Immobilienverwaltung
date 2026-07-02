import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional().default("")
});

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const exports = await prisma.documentExport.findMany({
    where: { portalInstanceId: user.portalInstanceId },
    include: { items: { include: { document: { select: { id: true, title: true, filename: true } } } } },
    orderBy: { createdAt: "desc" }
  });
  return NextResponse.json(exports.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    createdAt: item.createdAt,
    downloadedAt: item.downloadedAt,
    items: item.items.map((exportItem) => exportItem.document)
  })));
}

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Bitte Name pruefen.", issues: body.error.issues }, { status: 400 });
  const item = await prisma.documentExport.create({
    data: {
      portalInstanceId: user.portalInstanceId,
      createdById: user.id,
      name: body.data.name,
      description: body.data.description || null
    },
    include: { items: { include: { document: { select: { id: true, title: true, filename: true } } } } }
  });
  return NextResponse.json({ ...item, items: [] }, { status: 201 });
}
