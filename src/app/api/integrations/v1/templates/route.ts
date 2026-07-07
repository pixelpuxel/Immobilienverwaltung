import { NextRequest, NextResponse } from "next/server";
import { requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["read:contracts"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;
  const propertyId = request.nextUrl.searchParams.get("propertyId");
  const unitId = request.nextUrl.searchParams.get("unitId");
  if (unitId) {
    const unit = await prisma.unit.findFirst({ where: { id: unitId, property: portalWhere(user) } });
    if (!unit) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Einheit gehoert nicht zu dieser Instanz." } }, { status: 403 });
  }
  if (propertyId) {
    const property = await prisma.property.findFirst({ where: { id: propertyId, ...portalWhere(user) } });
    if (!property) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Immobilie gehoert nicht zu dieser Instanz." } }, { status: 403 });
  }
  const templates = await prisma.contractTemplate.findMany({
    where: {
      ...portalWhere(user),
      ...(unitId ? { unitId } : propertyId ? { propertyId } : {})
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      filename: true,
      mimeType: true,
      size: true,
      propertyId: true,
      unitId: true,
      isGlobalTemplate: true,
      property: { select: { id: true, name: true } },
      unit: { select: { id: true, unitNumber: true, property: { select: { id: true, name: true } } } },
      defaultForUnits: { select: { id: true, unitNumber: true, property: { select: { id: true, name: true } } } },
      createdAt: true
    }
  });
  return NextResponse.json({
    items: templates.map((template) => ({
      ...template,
      previewUrl: `/api/templates/${template.id}/preview`,
      downloadUrl: `/api/templates/${template.id}/download`
    })),
    nextCursor: null
  });
}
