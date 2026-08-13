import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz: ungueltiger Ursprung." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const existing = await prisma.propertyLoanAccountMapping.findFirst({ where: { id: params.id, property: portalWhere(user) } });
  if (!existing) return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  await prisma.propertyLoanAccountMapping.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
