import { AuditAction, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { assertSameOrigin, clientIp, hashPassword, requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  unitId: z.string().optional().nullable(),
  password: z.string().min(8).default("BitteSofortAendern123!"),
  birthdate: z.coerce.date().optional().nullable(),
  currentAddress: z.string().optional(),
  phone: z.string().optional(),
  moveInDate: z.coerce.date().optional().nullable(),
  moveOutDate: z.coerce.date().optional().nullable(),
  isCurrent: z.preprocess((value) => value === true || value === "true" || value === "on", z.boolean()).optional().default(true),
  leaseStartDate: z.coerce.date().optional().nullable(),
  rentAmount: z.coerce.number().optional().nullable(),
  serviceCharges: z.coerce.number().optional().nullable(),
  deposit: z.coerce.number().optional().nullable(),
  occupantCount: z.coerce.number().int().optional().nullable(),
  bankAccount: z.string().optional(),
  rentDueDay: z.coerce.number().int().optional().nullable(),
  landlordBankAccount: z.string().optional(),
  landlordBankName: z.string().optional(),
  roomDescription: z.string().optional(),
  sharedRooms: z.string().optional(),
  steppedRent: z.string().optional(),
  contractNotes: z.string().optional(),
  pets: z.string().optional(),
  specialAgreements: z.string().optional()
});

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  if (user.role === Role.TENANT) {
    return NextResponse.json(await prisma.tenantProfile.findUnique({ where: { userId: user.id }, include: { unit: { include: { property: true } } } }));
  }
  return NextResponse.json(await prisma.tenantProfile.findMany({ include: { user: true, unit: { include: { property: true } } } }));
}

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const actor = await requireApiUser(request);
  if (!actor) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Ungueltige Daten.", issues: body.error.issues }, { status: 400 });

  if (actor.role !== Role.ADMIN && actor.email !== body.data.email) {
    return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  }

  const { password, ...profileData } = body.data;
  const normalizedProfileData = {
    ...profileData,
    moveOutDate: profileData.isCurrent ? null : profileData.moveOutDate
  };
  const user = await prisma.user.upsert({
    where: { email: body.data.email },
    update: { name: `${body.data.firstName} ${body.data.lastName}`, role: Role.TENANT, active: true },
    create: {
      email: body.data.email,
      name: `${body.data.firstName} ${body.data.lastName}`,
      role: Role.TENANT,
      active: true,
      passwordHash: await hashPassword(password)
    }
  });

  const profile = await prisma.tenantProfile.upsert({
    where: { userId: user.id },
    update: { ...normalizedProfileData, userId: user.id },
    create: { ...normalizedProfileData, userId: user.id }
  });
  if (profile.unitId && profile.isCurrent) {
    await prisma.tenantProfile.updateMany({
      where: { unitId: profile.unitId, id: { not: profile.id } },
      data: { isCurrent: false, moveOutDate: new Date() }
    });
  }
  await auditLog({ userId: actor.id, action: AuditAction.USER_INVITED, entity: "TenantProfile", entityId: profile.id, ipAddress: clientIp(request) });
  return NextResponse.json(profile, { status: 201 });
}
