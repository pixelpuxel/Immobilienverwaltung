import { AuditAction, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { assertSameOrigin, clientIp, requireApiUser } from "@/lib/auth";
import { generateContract } from "@/lib/contracts";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  tenantProfileId: z.string(),
  unitId: z.string(),
  templateId: z.string().optional().nullable().transform((value) => value || null)
});

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  if (user.role === Role.TENANT) {
    const profile = await prisma.tenantProfile.findUnique({ where: { userId: user.id } });
    return NextResponse.json(profile ? await prisma.leaseContract.findMany({ where: { tenantProfileId: profile.id }, include: { unit: true } }) : []);
  }
  return NextResponse.json(await prisma.leaseContract.findMany({ where: { unit: { property: portalWhere(user) } }, include: { unit: true, tenantProfile: true, template: true } }));
}

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Ungueltige Daten." }, { status: 400 });
  const unit = await prisma.unit.findFirst({ where: { id: body.data.unitId, property: portalWhere(user) } });
  const tenantProfile = await prisma.tenantProfile.findFirst({ where: { id: body.data.tenantProfileId, user: portalWhere(user) } });
  const template = body.data.templateId ? await prisma.contractTemplate.findFirst({ where: { id: body.data.templateId, ...portalWhere(user) } }) : null;
  if (!unit || !tenantProfile || (body.data.templateId && !template)) return NextResponse.json({ error: "Auswahl gehoert nicht zu dieser Instanz." }, { status: 403 });
  const generated = await generateContract(body.data);
  const contract = await prisma.leaseContract.create({
    data: {
      tenantProfileId: body.data.tenantProfileId,
      unitId: body.data.unitId,
      templateId: body.data.templateId,
      docxPath: generated.docxPath,
      pdfPath: generated.pdfPath
    }
  });
  await auditLog({ userId: user.id, action: AuditAction.CONTRACT_GENERATED, entity: "LeaseContract", entityId: contract.id, ipAddress: clientIp(request) });
  return NextResponse.json(contract, { status: 201 });
}
