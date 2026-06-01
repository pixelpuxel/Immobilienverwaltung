import { Role, type Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationUser } from "@/lib/integration-auth";
import { brokerPropertyIds } from "@/lib/permissions";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["read:tenants"]);
  if (!user) return response;
  const propertyId = request.nextUrl.searchParams.get("propertyId");
  const current = request.nextUrl.searchParams.get("current");
  const where: Prisma.TenantProfileWhereInput = {
    AND: [
      await tenantAccessWhere(user),
      propertyId ? { unit: { propertyId } } : {},
      current === "true" ? { isCurrent: true } : current === "false" ? { isCurrent: false } : {}
    ]
  };
  const tenants = await prisma.tenantProfile.findMany({
    where,
    include: { unit: { include: { property: { select: { id: true, name: true } } } }, user: { select: { id: true, email: true, username: true, active: true } } },
    orderBy: [{ isCurrent: "desc" }, { updatedAt: "desc" }]
  });
  return NextResponse.json({ items: tenants, nextCursor: null });
}

async function tenantAccessWhere(user: { id: string; role: Role; portalInstanceId: string | null }) {
  if (user.role === Role.ADMIN) return { user: portalWhere(user) };
  if (user.role === Role.BROKER) return { isCurrent: true, unit: { propertyId: { in: await brokerPropertyIds(user.id) } } };
  return { userId: user.id };
}

