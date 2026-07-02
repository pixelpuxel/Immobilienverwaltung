import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const item = await prisma.documentExport.findFirst({ where: { id: params.id, portalInstanceId: user.portalInstanceId }, select: { id: true } });
  if (!item) return NextResponse.json({ error: "Export nicht gefunden." }, { status: 404 });
  await prisma.documentExport.delete({ where: { id: item.id } });
  return NextResponse.json({ ok: true });
}
