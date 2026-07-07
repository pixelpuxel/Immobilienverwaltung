import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional().default("")
});

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Bitte Eingaben pruefen.", issues: body.error.issues }, { status: 400 });
  const item = await prisma.documentExport.findFirst({ where: { id: params.id, portalInstanceId: user.portalInstanceId }, select: { id: true } });
  if (!item) return NextResponse.json({ error: "Export nicht gefunden." }, { status: 404 });
  const updated = await prisma.documentExport.update({
    where: { id: item.id },
    data: {
      name: body.data.name,
      description: body.data.description || null
    }
  });
  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const item = await prisma.documentExport.findFirst({ where: { id: params.id, portalInstanceId: user.portalInstanceId }, select: { id: true } });
  if (!item) return NextResponse.json({ error: "Export nicht gefunden." }, { status: 404 });
  await prisma.documentExport.delete({ where: { id: item.id } });
  return NextResponse.json({ ok: true });
}
