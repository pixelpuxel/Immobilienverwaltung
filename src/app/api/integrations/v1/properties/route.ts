import { Role, type Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationUser, requireAdminIntegration } from "@/lib/integration-auth";
import { propertySelect, serializeProperty } from "@/lib/integration-data";
import { brokerPropertyIds } from "@/lib/permissions";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";
import { normalizePropertyAddressInput } from "@/lib/property-address";
import { propertySchema } from "@/lib/property-schema";

export async function GET(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["read:properties"]);
  if (!user) return response;
  const q = request.nextUrl.searchParams.get("q")?.trim();
  const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || "50") || 50));
  const include = request.nextUrl.searchParams.get("include")?.split(",").map((item) => item.trim()).filter(Boolean);
  const updatedSince = request.nextUrl.searchParams.get("updatedSince");
  const baseWhere = await propertyAccessWhere(user);
  const where: Prisma.PropertyWhereInput = {
    AND: [
      baseWhere,
      q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { address: { contains: q, mode: "insensitive" } }, { city: { contains: q, mode: "insensitive" } }] } : {},
      updatedSince ? { updatedAt: { gte: new Date(updatedSince) } } : {}
    ]
  };
  const items = await prisma.property.findMany({ where, include: propertySelect(include), orderBy: { updatedAt: "desc" }, take: limit });
  return NextResponse.json({ items: items.map(serializeProperty), nextCursor: null });
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["write:properties"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;
  const body = propertySchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Ungueltige Daten.", issues: body.error.issues } }, { status: 400 });
  const data = normalizePropertyAddressInput(body.data);
  const property = await prisma.property.create({ data: { ...data, address: data.address || "", portalInstanceId: user.portalInstanceId } });
  return NextResponse.json(serializeProperty(property), { status: 201 });
}

async function propertyAccessWhere(user: { id: string; role: Role; portalInstanceId: string | null }) {
  if (user.role === Role.ADMIN) return portalWhere(user);
  if (user.role === Role.BROKER) return { ...portalWhere(user), id: { in: await brokerPropertyIds(user.id) } };
  const profile = await prisma.tenantProfile.findUnique({ where: { userId: user.id } });
  return { ...portalWhere(user), units: { some: { id: profile?.unitId || "" } } };
}

