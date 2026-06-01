import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const token = await prisma.apiToken.findFirst({ where: { id: params.id, user: portalWhere(user) } });
  if (!token) return NextResponse.json({ error: "Token nicht gefunden." }, { status: 404 });
  await prisma.apiToken.update({ where: { id: params.id }, data: { revokedAt: new Date() } });
  return NextResponse.json({ ok: true });
}

