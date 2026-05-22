import { AuditAction, Role } from "@prisma/client";
import { rm } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { auditLog } from "@/lib/audit";
import { assertSameOrigin, clientIp, requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const admin = await requireApiUser(request, [Role.ADMIN]);
  if (!admin) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });

  const contract = await prisma.leaseContract.findUnique({ where: { id: params.id } });
  if (!contract) return NextResponse.json({ error: "Vertrag wurde nicht gefunden." }, { status: 404 });

  await prisma.leaseContract.delete({ where: { id: contract.id } });
  await Promise.all([
    rm(contract.docxPath, { force: true }).catch(() => undefined),
    contract.pdfPath ? rm(contract.pdfPath, { force: true }).catch(() => undefined) : Promise.resolve()
  ]);
  await auditLog({
    userId: admin.id,
    action: AuditAction.CONTRACT_GENERATED,
    entity: "LeaseContract",
    entityId: contract.id,
    ipAddress: clientIp(request),
    detail: { deleted: true }
  });
  return NextResponse.json({ ok: true });
}
