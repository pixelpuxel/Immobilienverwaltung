import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { deriveContractTemplateFromContract } from "@/lib/contracts";
import { integrationError, requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  contractId: z.string().trim().min(1),
  name: z.string().trim().min(1).optional(),
  propertyId: z.string().trim().optional().nullable().transform((value) => value || null),
  unitId: z.string().trim().optional().nullable().transform((value) => value || null),
  defaultUnitIds: z.array(z.string().trim().min(1)).optional().default([]),
  isGlobalTemplate: z.boolean().optional().default(false)
});

export async function POST(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["read:contracts", "write:contracts"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;

  const body = schema.safeParse(await request.json());
  if (!body.success) return integrationError("BAD_REQUEST", "Ungueltige Vorlagendaten.", 400);

  const contract = await prisma.leaseContract.findFirst({
    where: { id: body.data.contractId, unit: { property: portalWhere(user) } },
    include: {
      tenantProfile: true,
      unit: { include: { property: { select: { id: true, name: true } } } }
    }
  });
  if (!contract) return integrationError("FORBIDDEN", "Vertrag gehoert nicht zu dieser Instanz.", 403);

  let propertyId = body.data.propertyId || contract.unit.property.id;
  const unitId = body.data.unitId;
  if (unitId) {
    const unit = await prisma.unit.findFirst({ where: { id: unitId, property: portalWhere(user) } });
    if (!unit) return integrationError("FORBIDDEN", "Einheit gehoert nicht zu dieser Instanz.", 403);
    propertyId = unit.propertyId;
  }
  if (propertyId) {
    const property = await prisma.property.findFirst({ where: { id: propertyId, ...portalWhere(user) } });
    if (!property) return integrationError("FORBIDDEN", "Immobilie gehoert nicht zu dieser Instanz.", 403);
  }
  if (body.data.defaultUnitIds.length) {
    const units = await prisma.unit.findMany({ where: { id: { in: body.data.defaultUnitIds }, property: portalWhere(user) }, select: { id: true } });
    if (units.length !== new Set(body.data.defaultUnitIds).size) {
      return integrationError("FORBIDDEN", "Mindestens eine Standard-Einheit gehoert nicht zu dieser Instanz.", 403);
    }
  }

  const template = await deriveContractTemplateFromContract({
    contractId: body.data.contractId,
    name: body.data.name || `Vorlage aus ${contract.tenantProfile.firstName} ${contract.tenantProfile.lastName}`.trim(),
    propertyId,
    unitId,
    defaultUnitIds: body.data.defaultUnitIds,
    isGlobalTemplate: body.data.isGlobalTemplate,
    portalInstanceId: user.portalInstanceId
  });
  if (!template) return integrationError("FORBIDDEN", "Vertrag gehoert nicht zu dieser Instanz.", 403);

  return NextResponse.json({
    ...template,
    previewUrl: `/api/integrations/v1/templates/${template.id}/preview`,
    downloadUrl: `/api/integrations/v1/templates/${template.id}/download`
  }, { status: 201 });
}
