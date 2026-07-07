import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { integrationDocumentInclude, integrationDocumentVisibilityWhere, integrationTenantAccessWhere, tenantPersonalDocumentWhere } from "@/lib/integration-document-access";
import { requireIntegrationUser } from "@/lib/integration-auth";
import { serializeDocument } from "@/lib/integration-data";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["read:documents"]);
  if (!user) return response;

  const tenant = await prisma.tenantProfile.findFirst({
    where: { AND: [{ id: params.id }, await integrationTenantAccessWhere(user)] },
    include: {
      unit: { include: { property: { select: { id: true, name: true } } } },
      user: { select: { id: true, email: true, username: true, active: true } }
    }
  });
  if (!tenant) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Mieter nicht gefunden oder nicht freigegeben." } }, { status: 404 });
  }

  const categoryId = request.nextUrl.searchParams.get("categoryId");
  const q = request.nextUrl.searchParams.get("q")?.trim();
  const updatedSince = request.nextUrl.searchParams.get("updatedSince");
  const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || "50") || 50));

  const where: Prisma.DocumentWhereInput = {
    AND: [
      await integrationDocumentVisibilityWhere(user),
      tenantPersonalDocumentWhere(tenant),
      categoryId ? { categoryId } : {},
      updatedSince ? { updatedAt: { gte: new Date(updatedSince) } } : {},
      q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { filename: { contains: q, mode: "insensitive" } }, { summary: { contains: q, mode: "insensitive" } }] } : {}
    ]
  };

  const documents = await prisma.document.findMany({
    where,
    include: integrationDocumentInclude(),
    orderBy: [{ documentYear: "desc" }, { updatedAt: "desc" }],
    take: limit
  });

  return NextResponse.json({
    tenant: {
      id: tenant.id,
      firstName: tenant.firstName,
      lastName: tenant.lastName,
      email: tenant.email,
      userId: tenant.userId,
      unitId: tenant.unitId,
      unit: tenant.unit
    },
    items: documents.map(serializeDocument),
    nextCursor: null
  });
}
