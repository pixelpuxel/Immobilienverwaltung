import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { assertPropertyInPortal } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";
import { unitSchema } from "@/lib/unit-schema";

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  return NextResponse.json(await prisma.unit.findMany({ where: { property: { portalInstanceId: user.portalInstanceId } }, include: { property: true } }));
}

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const body = unitSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Ungueltige Daten." }, { status: 400 });
  if (!(await assertPropertyInPortal(body.data.propertyId, user))) return NextResponse.json({ error: "Immobilie gehoert nicht zu dieser Instanz." }, { status: 403 });
  return NextResponse.json(await prisma.unit.create({ data: body.data }), { status: 201 });
}
