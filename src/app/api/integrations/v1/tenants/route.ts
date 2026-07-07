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

const tenantCreateSchema = z.object({
  unitId: z.string().nullable().optional(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  birthdate: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email(),
  currentAddress: z.string().nullable().optional(),
  moveInDate: z.string().nullable().optional(),
  moveOutDate: z.string().nullable().optional(),
  isCurrent: z.boolean().optional().default(true),
  leaseStartDate: z.string().nullable().optional(),
  rentAmount: z.coerce.number().nullable().optional(),
  garageRent: z.coerce.number().nullable().optional(),
  serviceCharges: z.coerce.number().nullable().optional(),
  deposit: z.coerce.number().nullable().optional(),
  depositPaidAmount: z.coerce.number().nullable().optional(),
  depositPaidAt: z.string().nullable().optional(),
  depositReturnedAmount: z.coerce.number().nullable().optional(),
  depositReturnedAt: z.string().nullable().optional(),
  depositStatus: z.string().optional().default("OPEN"),
  occupantCount: z.coerce.number().int().nullable().optional(),
  rentDueDay: z.coerce.number().int().nullable().optional()
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

  if (body.data.unitId) {
    const unit = await prisma.unit.findFirst({ where: { id: body.data.unitId, property: portalWhere(user) } });
    if (!unit) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Einheit gehoert nicht zu dieser Instanz." } }, { status: 403 });
  }

  const existingUser = await prisma.user.findFirst({ where: { email: body.data.email } });
  if (existingUser?.portalInstanceId && existingUser.portalInstanceId !== user.portalInstanceId) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Diese E-Mail wird bereits in einer anderen Instanz verwendet." } }, { status: 400 });
  }

  const displayName = `${body.data.firstName} ${body.data.lastName}`.trim();
  const portalUser = existingUser
    ? await prisma.user.update({ where: { id: existingUser.id }, data: { portalInstanceId: user.portalInstanceId, name: displayName, role: Role.TENANT, active: true } })
    : await prisma.user.create({
      data: {
        email: body.data.email,
        portalInstanceId: user.portalInstanceId,
        name: displayName,
        role: Role.TENANT,
        active: true,
        passwordHash: await hashPassword(`Portal-${crypto.randomUUID()}`)
      }
    });

  const tenantData = {
      userId: portalUser.id,
      unitId: body.data.unitId || null,
      firstName: body.data.firstName,
      lastName: body.data.lastName,
      birthdate: body.data.birthdate ? new Date(body.data.birthdate) : null,
      phone: body.data.phone || null,
      email: body.data.email,
      currentAddress: body.data.currentAddress || null,
      moveInDate: body.data.moveInDate ? new Date(body.data.moveInDate) : null,
      moveOutDate: body.data.moveOutDate ? new Date(body.data.moveOutDate) : null,
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
      rentDueDay: body.data.rentDueDay ?? null
  };
  const tenant = await prisma.tenantProfile.upsert({
    where: { userId: portalUser.id },
    update: tenantData,
    create: tenantData,
    include: { unit: { include: { property: { select: { id: true, name: true } } } }, user: { select: { id: true, email: true, username: true, active: true } } }
  });
  await auditLog({ userId: user.id, action: AuditAction.USER_INVITED, entity: "TenantProfile", entityId: tenant.id, ipAddress: clientIp(request) });
  return NextResponse.json(serializeTenant(tenant), { status: 201 });
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
