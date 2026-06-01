import { Role, type Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { serializeUnit } from "@/lib/integration-data";
import { brokerPropertyIds } from "@/lib/permissions";
import { assertPropertyInPortal, portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";
import { unitSchema } from "@/lib/unit-schema";

export async function GET(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["read:units"]);
  if (!user) return response;
  const propertyId = request.nextUrl.searchParams.get("propertyId");
  const where: Prisma.UnitWhereInput = { ...(await unitAccessWhere(user)), ...(propertyId ? { propertyId } : {}) };
  const units = await prisma.unit.findMany({ where, orderBy: { updatedAt: "desc" } });
  return NextResponse.json({ items: units.map(serializeUnit), nextCursor: null });
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["write:units"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;
  const body = unitSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Ungueltige Daten.", issues: body.error.issues } }, { status: 400 });
  if (!(await assertPropertyInPortal(body.data.propertyId, user))) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Immobilie gehoert nicht zu dieser Instanz." } }, { status: 403 });
  const unit = await prisma.unit.create({ data: body.data });
  return NextResponse.json(serializeUnit(unit), { status: 201 });
}

async function unitAccessWhere(user: { id: string; role: Role; portalInstanceId: string | null }) {
  if (user.role === Role.ADMIN) return { property: portalWhere(user) };
  if (user.role === Role.BROKER) return { propertyId: { in: await brokerPropertyIds(user.id) } };
  const profile = await prisma.tenantProfile.findUnique({ where: { userId: user.id } });
  return { id: profile?.unitId || "" };
}

