import { AuditAction, Role, type Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { clientIp } from "@/lib/auth";
import { contractPublicLinks } from "@/lib/contract-downloads";
import { ensureContractDocument, generateContract } from "@/lib/contracts";
import { integrationError, requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { brokerPropertyIds } from "@/lib/permissions";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  tenantProfileId: z.string(),
  unitId: z.string(),
  templateId: z.string().optional().nullable().transform((value) => value || null)
});

const CONTRACT_LINK_TTL_SECONDS = 30 * 24 * 60 * 60;

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
      ...contractLinkFields(request, contract.id, Boolean(contract.pdfPath))
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
  const document = await ensureContractDocument({ contractId: contract.id, actorUserId: user.id });
  await auditLog({ userId: user.id, action: AuditAction.CONTRACT_GENERATED, entity: "LeaseContract", entityId: contract.id, ipAddress: clientIp(request) });
  return NextResponse.json({
    id: contract.id,
    tenantProfileId: contract.tenantProfileId,
    unitId: contract.unitId,
    template: contract.template,
    tenantProfile: contract.tenantProfile,
    unit: contract.unit,
    createdAt: contract.createdAt,
    ...contractLinkFields(request, contract.id, Boolean(contract.pdfPath)),
    documentId: document.id
  }, { status: 201 });
}

async function contractAccessWhere(user: { id: string; role: Role; portalInstanceId: string | null }) {
  if (user.role === Role.ADMIN) return { unit: { property: portalWhere(user) } };
  if (user.role === Role.BROKER) return { unit: { propertyId: { in: await brokerPropertyIds(user.id) } } };
  return { tenantProfile: { userId: user.id } };
}

function contractLinkFields(request: NextRequest, contractId: string, hasPdf: boolean) {
  const links = contractPublicLinks(contractId, hasPdf, {
    absolute: true,
    signed: true,
    expiresInSeconds: CONTRACT_LINK_TTL_SECONDS,
    baseUrl: publicBaseUrl(request)
  });
  return {
    previewUrl: links.preview,
    downloadUrl: links.pdf || links.docx,
    docxDownloadUrl: links.docx,
    pdfDownloadUrl: links.pdf,
    signedLinksExpireInSeconds: CONTRACT_LINK_TTL_SECONDS
  };
}

function publicBaseUrl(request: NextRequest) {
  const configured = process.env.APP_URL?.trim();
  if (configured && !/localhost|127\.0\.0\.1|portal\.local|^http:\/\/app(?::|\/|$)/i.test(configured)) {
    return configured;
  }
  const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (forwardedHost && !/^app(?::|$)/i.test(forwardedHost)) {
    const protocol = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "") || "https";
    return `${protocol}://${forwardedHost}`;
  }
  return configured || request.nextUrl.origin;
}
