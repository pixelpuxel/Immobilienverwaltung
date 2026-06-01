import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { propertySelect, serializeProperty } from "@/lib/integration-data";
import { brokerPropertyIds } from "@/lib/permissions";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";
import { normalizePropertyAddressInput } from "@/lib/property-address";
import { propertyUpdateSchema } from "@/lib/property-schema";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["read:properties"]);
  if (!user) return response;
  const include = request.nextUrl.searchParams.get("include")?.split(",").map((item) => item.trim()).filter(Boolean);
  const property = await prisma.property.findFirst({ where: { id: params.id, ...(await propertyAccessWhere(user)) }, include: propertySelect(include) });
  return property ? NextResponse.json(serializeProperty(property)) : NextResponse.json({ error: { code: "NOT_FOUND", message: "Immobilie nicht gefunden." } }, { status: 404 });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["write:properties"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;
  const body = propertyUpdateSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Ungueltige Daten.", issues: body.error.issues } }, { status: 400 });
  const existing = await prisma.property.findFirst({ where: { id: params.id, ...portalWhere(user) } });
  if (!existing) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Immobilie nicht gefunden." } }, { status: 404 });
  const property = await prisma.property.update({ where: { id: params.id }, data: normalizePropertyAddressInput(body.data, existing) });
  return NextResponse.json(serializeProperty(property));
}

async function propertyAccessWhere(user: { id: string; role: Role; portalInstanceId: string | null }) {
  if (user.role === Role.ADMIN) return portalWhere(user);
  if (user.role === Role.BROKER) return { ...portalWhere(user), id: { in: await brokerPropertyIds(user.id) } };
  const profile = await prisma.tenantProfile.findUnique({ where: { userId: user.id } });
  return { ...portalWhere(user), units: { some: { id: profile?.unitId || "" } } };
}

