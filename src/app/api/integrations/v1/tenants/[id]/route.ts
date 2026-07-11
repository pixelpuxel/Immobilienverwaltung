import { Role, type Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { brokerPropertyIds } from "@/lib/permissions";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

const tenantUpdateSchema = z.object({
  unitId: z.string().nullable().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  birthdate: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email().optional(),
  currentAddress: z.string().nullable().optional(),
  moveInDate: z.string().nullable().optional(),
  moveOutDate: z.string().nullable().optional(),
  isCurrent: z.boolean().optional(),
  leaseStartDate: z.string().nullable().optional(),
  rentAmount: z.coerce.number().nullable().optional(),
  garageRent: z.coerce.number().nullable().optional(),
  serviceCharges: z.coerce.number().nullable().optional(),
  deposit: z.coerce.number().nullable().optional(),
  depositPaidAmount: z.coerce.number().nullable().optional(),
  depositPaidAt: z.string().nullable().optional(),
  depositReturnedAmount: z.coerce.number().nullable().optional(),
  depositReturnedAt: z.string().nullable().optional(),
  depositStatus: z.string().optional(),
  occupantCount: z.coerce.number().int().nullable().optional(),
  rentDueDay: z.coerce.number().int().nullable().optional(),
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

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["read:tenants"]);
  if (!user) return response;
  const tenant = await prisma.tenantProfile.findFirst({
    where: {
      id: params.id,
      ...(await tenantAccessWhere(user))
    },
    include: {
      unit: { include: { property: { select: { id: true, name: true } } } },
      user: { select: { id: true, email: true, username: true, active: true } }
    }
  });
  if (!tenant) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Mieter nicht gefunden." } }, { status: 404 });
  return NextResponse.json(serializeTenant(tenant));
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["write:tenants"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;
  const body = tenantUpdateSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Ungueltige Daten.", issues: body.error.issues } }, { status: 400 });
  const existing = await prisma.tenantProfile.findFirst({ where: { id: params.id, user: portalWhere(user) } });
  if (!existing) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Mieter nicht gefunden." } }, { status: 404 });
  if (body.data.unitId) {
    const unit = await prisma.unit.findFirst({ where: { id: body.data.unitId, property: portalWhere(user) } });
    if (!unit) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Einheit gehoert nicht zu dieser Instanz." } }, { status: 403 });
  }
  const nextIsCurrent = body.data.isCurrent ?? existing.isCurrent;
  const nextMoveOutDate = nextIsCurrent
    ? null
    : body.data.moveOutDate === undefined
      ? undefined
      : body.data.moveOutDate
        ? new Date(body.data.moveOutDate)
        : null;

  const tenant = await prisma.tenantProfile.update({
    where: { id: params.id },
    data: {
      ...body.data,
      birthdate: body.data.birthdate === undefined ? undefined : body.data.birthdate ? new Date(body.data.birthdate) : null,
      moveInDate: body.data.moveInDate === undefined ? undefined : body.data.moveInDate ? new Date(body.data.moveInDate) : null,
      moveOutDate: nextMoveOutDate,
      leaseStartDate: body.data.leaseStartDate === undefined ? undefined : body.data.leaseStartDate ? new Date(body.data.leaseStartDate) : null,
      depositPaidAt: body.data.depositPaidAt === undefined ? undefined : body.data.depositPaidAt ? new Date(body.data.depositPaidAt) : null,
      depositReturnedAt: body.data.depositReturnedAt === undefined ? undefined : body.data.depositReturnedAt ? new Date(body.data.depositReturnedAt) : null
    },
    include: {
      unit: { include: { property: { select: { id: true, name: true } } } },
      user: { select: { id: true, email: true, username: true, active: true } }
    }
  });
  await closeOtherCurrentTenantsIfNeeded(tenant);
  return NextResponse.json(serializeTenant(tenant));
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

async function tenantAccessWhere(user: { id: string; role: Role; portalInstanceId: string | null }): Promise<Prisma.TenantProfileWhereInput> {
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
