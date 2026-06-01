import { AuditAction, Role, type Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { clientIp } from "@/lib/auth";
import { generateContract } from "@/lib/contracts";
import { integrationError, requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { brokerPropertyIds } from "@/lib/permissions";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  tenantProfileId: z.string(),
  unitId: z.string(),
  templateId: z.string().optional().nullable().transform((value) => value || null)
});

export async function GET(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["read:contracts"]);
  if (!user) return response;
  const tenantId = request.nextUrl.searchParams.get("tenantId");
  const where: Prisma.LeaseContractWhereInput = {
    AND: [
      await contractAccessWhere(user),
      tenantId ? { tenantProfileId: tenantId } : {}
    ]
  };
  const contracts = await prisma.leaseContract.findMany({
    where,
    include: { tenantProfile: true, unit: { include: { property: { select: { id: true, name: true } } } }, template: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" }
  });
  return NextResponse.json({
    items: contracts.map((contract) => ({
      id: contract.id,
      tenantProfileId: contract.tenantProfileId,
      unitId: contract.unitId,
      template: contract.template,
      tenantProfile: contract.tenantProfile,
      unit: contract.unit,
      createdAt: contract.createdAt,
      previewUrl: `/api/contracts/${contract.id}/preview`,
      downloadUrl: `/api/contracts/${contract.id}/download`
    })),
    nextCursor: null
  });
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["write:contracts"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;
  const body = createSchema.safeParse(await request.json());
  if (!body.success) return integrationError("BAD_REQUEST", "Ungueltige Vertragsdaten.", 400);

  const unit = await prisma.unit.findFirst({
    where: { id: body.data.unitId, property: portalWhere(user) },
    include: { property: true }
  });
  const tenantProfile = await prisma.tenantProfile.findFirst({
    where: { id: body.data.tenantProfileId, user: portalWhere(user) }
  });
  const template = body.data.templateId ? await prisma.contractTemplate.findFirst({ where: { id: body.data.templateId, ...portalWhere(user) } }) : null;
  if (!unit || !tenantProfile || (body.data.templateId && !template)) {
    return integrationError("FORBIDDEN", "Mieter, Einheit oder Vorlage gehoert nicht zu dieser Instanz.", 403);
  }

  const generated = await generateContract(body.data);
  const contract = await prisma.leaseContract.create({
    data: {
      tenantProfileId: body.data.tenantProfileId,
      unitId: body.data.unitId,
      templateId: body.data.templateId,
      docxPath: generated.docxPath,
      pdfPath: generated.pdfPath
    },
    include: { tenantProfile: true, unit: { include: { property: { select: { id: true, name: true } } } }, template: { select: { id: true, name: true } } }
  });
  await auditLog({ userId: user.id, action: AuditAction.CONTRACT_GENERATED, entity: "LeaseContract", entityId: contract.id, ipAddress: clientIp(request) });
  return NextResponse.json({
    id: contract.id,
    tenantProfileId: contract.tenantProfileId,
    unitId: contract.unitId,
    template: contract.template,
    tenantProfile: contract.tenantProfile,
    unit: contract.unit,
    createdAt: contract.createdAt,
    previewUrl: `/api/contracts/${contract.id}/preview`,
    docxDownloadUrl: `/api/contracts/${contract.id}/download?format=docx`,
    pdfDownloadUrl: `/api/contracts/${contract.id}/download?format=pdf`
  }, { status: 201 });
}

async function contractAccessWhere(user: { id: string; role: Role; portalInstanceId: string | null }) {
  if (user.role === Role.ADMIN) return { unit: { property: portalWhere(user) } };
  if (user.role === Role.BROKER) return { unit: { propertyId: { in: await brokerPropertyIds(user.id) } } };
  return { tenantProfile: { userId: user.id } };
}
