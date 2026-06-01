import { NextRequest, NextResponse } from "next/server";
import { requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { serializeUnit } from "@/lib/integration-data";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";
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
  const unit = await prisma.unit.update({ where: { id: params.id }, data: body.data });
  return NextResponse.json(serializeUnit(unit));
}

