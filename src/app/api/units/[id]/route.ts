import { Prisma, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateWarmRent } from "@/lib/rent";
import { unitUpdateSchema } from "@/lib/unit-schema";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const body = unitUpdateSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Ungueltige Daten.", issues: body.error.issues }, { status: 400 });
  const existing = await prisma.unit.findFirst({ where: { id: params.id, property: { portalInstanceId: user.portalInstanceId } } });
  if (!existing) return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  const data: Prisma.UnitUpdateInput = { ...body.data };
  if (body.data.rentAmount !== undefined || body.data.garageRent !== undefined || body.data.serviceCharges !== undefined) {
    data.warmRent = calculateWarmRent({ ...existing, ...body.data });
  }
  return NextResponse.json(await prisma.unit.update({ where: { id: params.id }, data }));
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const existing = await prisma.unit.findFirst({ where: { id: params.id, property: { portalInstanceId: user.portalInstanceId } } });
  if (!existing) return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  await prisma.unit.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
