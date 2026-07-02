import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  documentId: z.string().min(1)
});

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Dokument fehlt." }, { status: 400 });
  const [documentExport, document] = await Promise.all([
    prisma.documentExport.findFirst({ where: { id: params.id, portalInstanceId: user.portalInstanceId }, select: { id: true } }),
    prisma.document.findFirst({ where: { id: body.data.documentId, ...portalWhere(user) }, select: { id: true } })
  ]);
  if (!documentExport) return NextResponse.json({ error: "Export nicht gefunden." }, { status: 404 });
  if (!document) return NextResponse.json({ error: "Dokument nicht gefunden." }, { status: 404 });
  await prisma.documentExportItem.upsert({
    where: { exportId_documentId: { exportId: documentExport.id, documentId: document.id } },
    update: {},
    create: { exportId: documentExport.id, documentId: document.id }
  });
  const count = await prisma.documentExportItem.count({ where: { exportId: documentExport.id } });
  return NextResponse.json({ ok: true, count });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Dokument fehlt." }, { status: 400 });
  const documentExport = await prisma.documentExport.findFirst({ where: { id: params.id, portalInstanceId: user.portalInstanceId }, select: { id: true } });
  if (!documentExport) return NextResponse.json({ error: "Export nicht gefunden." }, { status: 404 });
  await prisma.documentExportItem.deleteMany({ where: { exportId: documentExport.id, documentId: body.data.documentId } });
  const count = await prisma.documentExportItem.count({ where: { exportId: documentExport.id } });
  return NextResponse.json({ ok: true, count });
}
