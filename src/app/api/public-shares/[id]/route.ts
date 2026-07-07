import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { deletePrivateFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const share = await prisma.publicShare.findFirst({ where: { id: params.id, portalInstanceId: user.portalInstanceId } });
  if (!share) return NextResponse.json({ error: "Freigabe nicht gefunden." }, { status: 404 });
  await prisma.publicShare.update({ where: { id: share.id }, data: { revokedAt: new Date() } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const share = await prisma.publicShare.findFirst({
    where: { id: params.id, portalInstanceId: user.portalInstanceId },
    include: { files: true }
  });
  if (!share) return NextResponse.json({ error: "Freigabe nicht gefunden." }, { status: 404 });

  for (const file of share.files) {
    if (!file.sourceDocumentId) await deletePrivateFile(file.storagePath);
  }
  await prisma.publicShare.delete({ where: { id: share.id } });
  return NextResponse.json({ ok: true });
}
