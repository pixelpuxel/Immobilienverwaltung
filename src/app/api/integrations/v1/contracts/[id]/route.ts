import { AuditAction, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auditLog } from "@/lib/audit";
import { clientIp } from "@/lib/auth";
import { contractPublicLinks } from "@/lib/contract-downloads";
import { deletePrivateFile } from "@/lib/files";
import { integrationError, requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { brokerPropertyIds } from "@/lib/permissions";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

const CONTRACT_LINK_TTL_SECONDS = 30 * 24 * 60 * 60;

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["read:contracts"]);
  if (!user) return response;

  const contract = await prisma.leaseContract.findFirst({
    where: { id: params.id, unit: { property: portalWhere(user) } },
    include: { tenantProfile: true, unit: { include: { property: { select: { id: true, name: true } } } }, template: { select: { id: true, name: true } } }
  });
  const brokerCanAccess = user.role === Role.BROKER && contract ? (await brokerPropertyIds(user.id)).includes(contract.unit.propertyId) : false;
  if (!contract || (user.role !== Role.ADMIN && contract.tenantProfile.userId !== user.id && !brokerCanAccess)) {
    return integrationError("FORBIDDEN", "Nicht erlaubt.", 403);
  }

  return NextResponse.json({
    id: contract.id,
    tenantProfileId: contract.tenantProfileId,
    unitId: contract.unitId,
    template: contract.template,
    tenantProfile: contract.tenantProfile,
    unit: contract.unit,
    createdAt: contract.createdAt,
    ...contractLinkFields(request, contract.id, Boolean(contract.pdfPath))
  });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["write:contracts"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;

  const contract = await prisma.leaseContract.findFirst({
    where: { id: params.id, unit: { property: portalWhere(user) } }
  });
  if (!contract) return integrationError("NOT_FOUND", "Vertrag wurde nicht gefunden.", 404);

  const [docxReferences, pdfReferences] = await Promise.all([
    prisma.document.count({ where: { storagePath: contract.docxPath } }),
    contract.pdfPath ? prisma.document.count({ where: { storagePath: contract.pdfPath } }) : Promise.resolve(0)
  ]);

  await prisma.leaseContract.delete({ where: { id: contract.id } });
  if (docxReferences === 0) {
    await deletePrivateFile(contract.docxPath).catch(() => undefined);
  }
  if (contract.pdfPath && pdfReferences === 0) {
    await deletePrivateFile(contract.pdfPath).catch(() => undefined);
  }

  await auditLog({
    userId: user.id,
    action: AuditAction.CONTRACT_GENERATED,
    entity: "LeaseContract",
    entityId: contract.id,
    ipAddress: clientIp(request),
    detail: { deleted: true }
  });
  return NextResponse.json({ ok: true });
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
