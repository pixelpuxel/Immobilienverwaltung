import { NextRequest, NextResponse } from "next/server";
import { requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { serializeUnit } from "@/lib/integration-data";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";
import { calculateWarmRent } from "@/lib/rent";
import { unitUpdateSchema } from "@/lib/unit-schema";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["write:units"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;
  const body = unitUpdateSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Ungueltige Daten.", issues: body.error.issues } }, { status: 400 });
  const existing = await prisma.unit.findFirst({ where: { id: params.id, property: portalWhere(user) } });
  if (!existing) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Einheit nicht gefunden." } }, { status: 404 });
  const data = { ...body.data };
  if (body.data.rentAmount !== undefined || body.data.garageRent !== undefined || body.data.serviceCharges !== undefined || body.data.warmRent !== undefined) {
    Object.assign(data, { warmRent: calculateWarmRent({ ...existing, ...body.data }) });
  }
  const unit = await prisma.unit.update({ where: { id: params.id }, data });
  return NextResponse.json(serializeUnit(unit));
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["write:units"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;
  const existing = await prisma.unit.findFirst({ where: { id: params.id, property: portalWhere(user) } });
  if (!existing) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Einheit nicht gefunden." } }, { status: 404 });
  await prisma.unit.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
