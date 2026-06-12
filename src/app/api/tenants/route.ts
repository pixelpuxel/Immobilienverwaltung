import { AuditAction, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { assertSameOrigin, clientIp, hashPassword, requireApiUser } from "@/lib/auth";
import { sendWelcomeMail } from "@/lib/mail";
import { assertUnitInPortal, portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

const optionalDate = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return null;
  return value;
}, z.coerce.date().optional().nullable());

const optionalNumber = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return null;
  return value;
}, z.coerce.number().optional().nullable());

const optionalInt = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return null;
  return value;
}, z.coerce.number().int().optional().nullable());

const schema = z.object({
  email: z.string().email().optional().or(z.literal("")),
  username: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  unitId: z.string().optional().nullable(),
  password: z.string().min(8).default("BitteSofortAendern123!"),
  birthdate: optionalDate,
  currentAddress: z.string().optional(),
  phone: z.string().optional(),
  moveInDate: optionalDate,
  moveOutDate: optionalDate,
  isCurrent: z.preprocess((value) => value === true || value === "true" || value === "on", z.boolean()).optional().default(true),
  leaseStartDate: optionalDate,
  rentAmount: optionalNumber,
  garageRent: optionalNumber,
  serviceCharges: optionalNumber,
  deposit: optionalNumber,
  occupantCount: optionalInt,
  bankAccount: z.string().optional(),
  rentDueDay: optionalInt,
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
  return NextResponse.json(await prisma.tenantProfile.findMany({ where: { user: portalWhere(user) }, include: { user: true, unit: { include: { property: true } } } }));
}

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const actor = await requireApiUser(request);
  if (!actor) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Ungueltige Daten.", issues: body.error.issues }, { status: 400 });
  const firstName = cleanText(body.data.firstName);
  const lastName = cleanText(body.data.lastName);
  const nameSlug = slugify([firstName, lastName].filter(Boolean).join("-"));
  const generatedUsername = body.data.username || (nameSlug ? `${nameSlug}-${Date.now().toString(36).slice(-4)}` : undefined);
  const identity = accountIdentity(body.data.email, generatedUsername);
  if (!identity) return NextResponse.json({ error: "Bitte mindestens Benutzername, Vorname oder Nachname angeben." }, { status: 400 });
  if (!(await assertUnitInPortal(body.data.unitId, actor))) return NextResponse.json({ error: "Einheit gehoert nicht zu dieser Instanz." }, { status: 403 });
  const selectedUnit = body.data.unitId
    ? await prisma.unit.findFirst({
      where: { id: body.data.unitId, property: portalWhere(actor) },
      select: { unitNumber: true, rentAmount: true, garageRent: true, serviceCharges: true, property: { select: { name: true } } }
    })
    : null;

  if (actor.role !== Role.ADMIN && actor.email !== identity.email && actor.username !== identity.username) {
    return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  }

  const { password, username, ...profileData } = body.data;
  const displayFirstName = firstName || identity.username || identity.email.split("@")[0] || "Mieter";
  const displayLastName = lastName || "";
  const displayName = `${displayFirstName} ${displayLastName}`.trim();
  const normalizedProfileData = {
    ...profileData,
    firstName: displayFirstName,
    lastName: displayLastName,
    email: identity.email,
    rentAmount: profileData.rentAmount ?? selectedUnit?.rentAmount ?? null,
    garageRent: profileData.garageRent ?? selectedUnit?.garageRent ?? null,
    serviceCharges: profileData.serviceCharges ?? selectedUnit?.serviceCharges ?? null,
    deposit: profileData.deposit ?? suggestedDeposit(selectedUnit),
    moveOutDate: profileData.isCurrent ? null : profileData.moveOutDate
  };
  const existingUser = await prisma.user.findFirst({ where: { OR: [{ email: identity.email }, ...(identity.username ? [{ username: identity.username }] : [])] } });
  if (existingUser?.portalInstanceId && existingUser.portalInstanceId !== actor.portalInstanceId) {
    return NextResponse.json({ error: "Diese Zugangsdaten werden bereits in einer anderen Instanz verwendet." }, { status: 400 });
  }
  const user = existingUser
    ? await prisma.user.update({ where: { id: existingUser.id }, data: { portalInstanceId: actor.portalInstanceId, username: identity.username, name: displayName, role: Role.TENANT, active: true } })
    : await prisma.user.create({
      data: {
        email: identity.email,
        portalInstanceId: actor.portalInstanceId,
        username: identity.username,
        name: displayName,
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
    const unit = await prisma.unit.findUnique({ where: { id: profile.unitId }, select: { isSharedHousing: true } });
    if (!unit?.isSharedHousing) {
      await prisma.tenantProfile.updateMany({
        where: { unitId: profile.unitId, id: { not: profile.id } },
        data: { isCurrent: false, moveOutDate: profile.moveInDate || new Date() }
      });
    }
  }
  await auditLog({ userId: actor.id, action: AuditAction.USER_INVITED, entity: "TenantProfile", entityId: profile.id, ipAddress: clientIp(request) });
  const mail = await sendWelcomeMail({
    to: user.email,
    name: user.name,
    roleLabel: "Mieter",
    identifier: user.username || user.email,
    password,
    portalInstanceId: actor.portalInstanceId,
    context: {
      property: selectedUnit?.property.name,
      unit: selectedUnit?.unitNumber
    }
  }).catch((error) => ({ sent: false, reason: error instanceof Error ? error.message : "unknown" }));
  return NextResponse.json({ ...profile, mail }, { status: 201 });
}

function accountIdentity(email?: string, username?: string) {
  const normalizedEmail = email?.trim().toLowerCase();
  const normalizedUsername = username?.trim().toLowerCase();
  if (!normalizedEmail && !normalizedUsername) return null;
  return {
    email: normalizedEmail || `${normalizedUsername}@portal.local`,
    username: normalizedUsername || null
  };
}

function cleanText(value?: string) {
  return value?.trim() || "";
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || undefined;
}

function suggestedDeposit(unit?: { rentAmount: unknown; garageRent: unknown } | null) {
  if (!unit) return null;
  const coldRent = Number(unit.rentAmount || 0) + Number(unit.garageRent || 0);
  return coldRent ? coldRent * 3 : null;
}
