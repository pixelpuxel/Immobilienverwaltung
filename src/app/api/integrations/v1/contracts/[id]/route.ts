import { AuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auditLog } from "@/lib/audit";
import { clientIp } from "@/lib/auth";
import { deletePrivateFile } from "@/lib/files";
import { integrationError, requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

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
