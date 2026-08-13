import { AuditAction, Role, type Prisma } from "@prisma/client";
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { clientIp, hashPassword } from "@/lib/auth";
import { requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { brokerPropertyIds } from "@/lib/permissions";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

const optionalNumber = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return null;
  return value;
}, z.coerce.number().optional().nullable());

const optionalInt = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return null;
  return value;
}, z.coerce.number().int().optional().nullable());

const tenantCreateSchema = z.object({
  unitId: z.string().nullable().optional(),
  username: z.string().trim().optional(),
  password: z.string().min(8).default("BitteSofortAendern123!"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  birthdate: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email().optional().or(z.literal("")),
  currentAddress: z.string().nullable().optional(),
  moveInDate: z.string().nullable().optional(),
  moveOutDate: z.string().nullable().optional(),
  isCurrent: z.boolean().optional().default(true),
  leaseStartDate: z.string().nullable().optional(),
  rentAmount: optionalNumber,
  garageRent: optionalNumber,
  serviceCharges: optionalNumber,
  deposit: optionalNumber,
  depositPaidAmount: optionalNumber,
  depositPaidAt: z.string().nullable().optional(),
  depositReturnedAmount: optionalNumber,
  depositReturnedAt: z.string().nullable().optional(),
  depositStatus: z.string().optional().default("OPEN"),
  occupantCount: optionalInt,
  rentDueDay: optionalInt,
  bankAccount: z.string().nullable().optional(),
  landlordBankAccount: z.string().nullable().optional(),
  landlordBankName: z.string().nullable().optional(),
  roomDescription: z.string().nullable().optional(),
  sharedRooms: z.string().nullable().optional(),
  steppedRent: z.string().nullable().optional(),
  contractNotes: z.string().nullable().optional(),
  pets: z.string().nullable().optional(),
  specialAgreements: z.string().nullable().optional()
});

export async function GET(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["read:tenants"]);
  if (!user) return response;
  const propertyId = request.nextUrl.searchParams.get("propertyId");
  const current = request.nextUrl.searchParams.get("current");
  const where: Prisma.TenantProfileWhereInput = {
    AND: [
      await tenantAccessWhere(user),
      propertyId ? { unit: { propertyId } } : {},
      current === "true" ? { isCurrent: true } : current === "false" ? { isCurrent: false } : {}
    ]
  };
  const tenants = await prisma.tenantProfile.findMany({
    where,
    include: { unit: { include: { property: { select: { id: true, name: true } } } }, user: { select: { id: true, email: true, username: true, active: true } } },
    orderBy: [{ isCurrent: "desc" }, { updatedAt: "desc" }]
  });
  return NextResponse.json({ items: tenants, nextCursor: null });
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["write:tenants"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;
  const body = tenantCreateSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Ungueltige Daten.", issues: body.error.issues } }, { status: 400 });

  const firstName = cleanText(body.data.firstName);
  const lastName = cleanText(body.data.lastName);
  const nameSlug = slugify([firstName, lastName].filter(Boolean).join("-"));
  const generatedUsername = body.data.username || (nameSlug ? `${nameSlug}-${Date.now().toString(36).slice(-4)}` : undefined);
  const identity = accountIdentity(body.data.email, generatedUsername);
  if (!identity) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Bitte mindestens Benutzername, Vorname oder Nachname angeben." } }, { status: 400 });
  }

  if (body.data.unitId) {
    const unit = await prisma.unit.findFirst({ where: { id: body.data.unitId, property: portalWhere(user) } });
    if (!unit) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Einheit gehoert nicht zu dieser Instanz." } }, { status: 403 });
  }

  const existingUser = await prisma.user.findFirst({ where: { OR: [{ email: identity.email }, ...(identity.username ? [{ username: identity.username }] : [])] } });
  if (existingUser?.portalInstanceId && existingUser.portalInstanceId !== user.portalInstanceId) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Diese Zugangsdaten werden bereits in einer anderen Instanz verwendet." } }, { status: 400 });
  }

  const displayFirstName = firstName || identity.username || identity.email.split("@")[0] || "Mieter";
  const displayLastName = lastName || "";
  const displayName = `${displayFirstName} ${displayLastName}`.trim();
  const portalUser = existingUser
    ? await prisma.user.update({ where: { id: existingUser.id }, data: { portalInstanceId: user.portalInstanceId, username: identity.username, name: displayName, role: Role.TENANT, active: true } })
    : await prisma.user.create({
      data: {
        email: identity.email,
        username: identity.username,
        portalInstanceId: user.portalInstanceId,
        name: displayName,
        role: Role.TENANT,
        active: true,
        passwordHash: await hashPassword(body.data.password || `Portal-${crypto.randomUUID()}`)
      }
    });

  const tenantData = {
      userId: portalUser.id,
      unitId: body.data.unitId || null,
      firstName: displayFirstName,
      lastName: displayLastName,
      birthdate: body.data.birthdate ? new Date(body.data.birthdate) : null,
      phone: body.data.phone || null,
      email: identity.email,
      currentAddress: body.data.currentAddress || null,
      moveInDate: body.data.moveInDate ? new Date(body.data.moveInDate) : null,
      moveOutDate: body.data.isCurrent ? null : body.data.moveOutDate ? new Date(body.data.moveOutDate) : null,
      isCurrent: body.data.isCurrent,
      leaseStartDate: body.data.leaseStartDate ? new Date(body.data.leaseStartDate) : null,
      rentAmount: body.data.rentAmount ?? null,
      garageRent: body.data.garageRent ?? null,
      serviceCharges: body.data.serviceCharges ?? null,
      deposit: body.data.deposit ?? null,
      depositPaidAmount: body.data.depositPaidAmount ?? null,
      depositPaidAt: body.data.depositPaidAt ? new Date(body.data.depositPaidAt) : null,
      depositReturnedAmount: body.data.depositReturnedAmount ?? null,
      depositReturnedAt: body.data.depositReturnedAt ? new Date(body.data.depositReturnedAt) : null,
      depositStatus: body.data.depositStatus,
      occupantCount: body.data.occupantCount ?? null,
      rentDueDay: body.data.rentDueDay ?? null,
      bankAccount: optionalText(body.data.bankAccount),
      landlordBankAccount: optionalText(body.data.landlordBankAccount),
      landlordBankName: optionalText(body.data.landlordBankName),
      roomDescription: optionalText(body.data.roomDescription),
      sharedRooms: optionalText(body.data.sharedRooms),
      steppedRent: optionalText(body.data.steppedRent),
      contractNotes: optionalText(body.data.contractNotes),
      pets: optionalText(body.data.pets),
      specialAgreements: optionalText(body.data.specialAgreements)
  };
  const tenant = await prisma.tenantProfile.upsert({
    where: { userId: portalUser.id },
    update: tenantData,
    create: tenantData,
    include: { unit: { include: { property: { select: { id: true, name: true } } } }, user: { select: { id: true, email: true, username: true, active: true } } }
  });
  await closeOtherCurrentTenantsIfNeeded(tenant);
  await auditLog({ userId: user.id, action: AuditAction.USER_INVITED, entity: "TenantProfile", entityId: tenant.id, ipAddress: clientIp(request) });
  return NextResponse.json(serializeTenant(tenant), { status: 201 });
}

async function closeOtherCurrentTenantsIfNeeded(tenant: { id: string; unitId: string | null; isCurrent: boolean; moveInDate: Date | null }) {
  if (!tenant.unitId || !tenant.isCurrent) return;
  const unit = await prisma.unit.findUnique({ where: { id: tenant.unitId }, select: { isSharedHousing: true } });
  if (unit?.isSharedHousing) return;
  await prisma.tenantProfile.updateMany({
    where: { unitId: tenant.unitId, id: { not: tenant.id }, isCurrent: true },
    data: { isCurrent: false, moveOutDate: tenant.moveInDate || new Date() }
  });
}

async function tenantAccessWhere(user: { id: string; role: Role; portalInstanceId: string | null }) {
  if (user.role === Role.ADMIN) return { user: portalWhere(user) };
  if (user.role === Role.BROKER) return { unit: { propertyId: { in: await brokerPropertyIds(user.id) } } };
  return { userId: user.id };
}

function serializeTenant(tenant: {
  rentAmount?: { toString(): string } | null;
  garageRent?: { toString(): string } | null;
  serviceCharges?: { toString(): string } | null;
  deposit?: { toString(): string } | null;
  depositPaidAmount?: { toString(): string } | null;
  depositReturnedAmount?: { toString(): string } | null;
  [key: string]: unknown;
}) {
  return {
    ...tenant,
    rentAmount: tenant.rentAmount?.toString() ?? null,
    garageRent: tenant.garageRent?.toString() ?? null,
    serviceCharges: tenant.serviceCharges?.toString() ?? null,
    deposit: tenant.deposit?.toString() ?? null,
    depositPaidAmount: tenant.depositPaidAmount?.toString() ?? null,
    depositReturnedAmount: tenant.depositReturnedAmount?.toString() ?? null
  };
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

function optionalText(value?: string | null) {
  return value?.trim() || null;
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
