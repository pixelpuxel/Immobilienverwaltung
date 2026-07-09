import { Role, type Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";
import { asMoneyNumber, calculateColdRent, calculateWarmRent } from "@/lib/rent";

const money = z.preprocess((value) => value === "" || value === null || value === undefined ? null : value, z.coerce.number().nullable().optional());

const schema = z.object({
  unitId: z.string().min(1),
  tenantProfileId: z.string().optional().nullable(),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  expectedColdRent: z.coerce.number().min(0),
  expectedServiceCharges: z.coerce.number().min(0),
  expectedTotalRent: z.coerce.number().min(0),
  paidColdRent: money,
  paidServiceCharges: money,
  paidTotalRent: money,
  status: z.enum(["OPEN", "PAID", "PARTIAL"]),
  paidAt: z.string().optional().nullable()
});

export async function GET(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["read:properties", "read:tenants"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;

  const today = new Date();
  const year = Number(request.nextUrl.searchParams.get("year") || today.getFullYear());
  const month = Number(request.nextUrl.searchParams.get("month") || today.getMonth() + 1);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Ungueltiger Monat." } }, { status: 400 });
  }

  const [units, payments] = await Promise.all([
    prisma.unit.findMany({
      where: { property: portalWhere(user), tenants: { some: { isCurrent: true } } },
      include: {
        property: { select: { id: true, name: true } },
        tenants: {
          where: { isCurrent: true },
          orderBy: { moveInDate: "desc" },
          take: 1,
          include: { user: { select: { id: true, email: true, username: true, active: true } } }
        }
      },
      orderBy: [{ property: { name: "asc" } }, { unitNumber: "asc" }]
    }),
    prisma.rentPayment.findMany({
      where: { year, month, unit: { property: portalWhere(user) } },
      include: {
        unit: { include: { property: { select: { id: true, name: true } } } },
        tenantProfile: { include: { user: { select: { id: true, email: true, username: true, active: true } } } }
      }
    })
  ]);

  const paymentByUnit = new Map(payments.map((payment) => [payment.unitId, payment]));
  const items = units.map((unit) => {
    const tenant = unit.tenants[0] || null;
    const rentSource = {
      rentAmount: tenant?.rentAmount ?? unit.rentAmount,
      garageRent: tenant?.garageRent ?? unit.garageRent,
      serviceCharges: tenant?.serviceCharges ?? unit.serviceCharges
    };
    const payment = paymentByUnit.get(unit.id);
    return serializeRentPayment({
      id: payment?.id || `expected-${unit.id}-${year}-${month}`,
      unitId: unit.id,
      tenantProfileId: payment?.tenantProfileId ?? tenant?.id ?? null,
      year,
      month,
      expectedColdRent: payment?.expectedColdRent ?? calculateColdRent(rentSource),
      expectedServiceCharges: payment?.expectedServiceCharges ?? asMoneyNumber(rentSource.serviceCharges),
      expectedTotalRent: payment?.expectedTotalRent ?? calculateWarmRent(rentSource),
      paidColdRent: payment?.paidColdRent ?? null,
      paidServiceCharges: payment?.paidServiceCharges ?? null,
      paidTotalRent: payment?.paidTotalRent ?? null,
      status: payment?.status || "OPEN",
      paidAt: payment?.paidAt ?? null,
      unit: {
        id: unit.id,
        unitNumber: unit.unitNumber,
        property: unit.property
      },
      tenantProfile: payment?.tenantProfile ?? tenant
    });
  });

  return NextResponse.json({ items, nextCursor: null });
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["write:tenants"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;

  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Ungueltige Daten.", issues: body.error.issues } }, { status: 400 });

  const unit = await prisma.unit.findFirst({ where: { id: body.data.unitId, property: portalWhere(user) }, include: { property: { select: { id: true, name: true } } } });
  if (!unit) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Einheit nicht gefunden." } }, { status: 404 });

  let tenantProfileId = body.data.tenantProfileId || null;
  if (tenantProfileId) {
    const tenant = await prisma.tenantProfile.findFirst({ where: { id: tenantProfileId, unit: { property: portalWhere(user) } } });
    if (!tenant) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Mieter gehoert nicht zu dieser Instanz." } }, { status: 403 });
  }

  const paidTotalRent = body.data.status === "PAID" ? body.data.expectedTotalRent : body.data.paidTotalRent ?? 0;
  const ratio = body.data.expectedTotalRent > 0 ? paidTotalRent / body.data.expectedTotalRent : 0;
  const paidColdRent = body.data.status === "PAID" ? body.data.expectedColdRent : body.data.paidColdRent ?? Math.round(body.data.expectedColdRent * ratio * 100) / 100;
  const paidServiceCharges = body.data.status === "PAID" ? body.data.expectedServiceCharges : body.data.paidServiceCharges ?? Math.round(body.data.expectedServiceCharges * ratio * 100) / 100;
  const paidAt = body.data.status === "OPEN" ? null : body.data.paidAt ? new Date(body.data.paidAt) : new Date();

  const payment = await prisma.rentPayment.upsert({
    where: { unitId_year_month: { unitId: body.data.unitId, year: body.data.year, month: body.data.month } },
    update: {
      tenantProfileId,
      expectedColdRent: body.data.expectedColdRent,
      expectedServiceCharges: body.data.expectedServiceCharges,
      expectedTotalRent: body.data.expectedTotalRent,
      paidColdRent,
      paidServiceCharges,
      paidTotalRent,
      status: body.data.status,
      paidAt
    },
    create: {
      unitId: body.data.unitId,
      tenantProfileId,
      year: body.data.year,
      month: body.data.month,
      expectedColdRent: body.data.expectedColdRent,
      expectedServiceCharges: body.data.expectedServiceCharges,
      expectedTotalRent: body.data.expectedTotalRent,
      paidColdRent,
      paidServiceCharges,
      paidTotalRent,
      status: body.data.status,
      paidAt
    },
    include: {
      unit: { include: { property: { select: { id: true, name: true } } } },
      tenantProfile: { include: { user: { select: { id: true, email: true, username: true, active: true } } } }
    }
  });

  return NextResponse.json(serializeRentPayment(payment));
}

function serializeRentPayment(payment: RentPaymentLike) {
  return {
    ...payment,
    expectedColdRent: moneyString(payment.expectedColdRent),
    expectedServiceCharges: moneyString(payment.expectedServiceCharges),
    expectedTotalRent: moneyString(payment.expectedTotalRent),
    paidColdRent: moneyStringOrNull(payment.paidColdRent),
    paidServiceCharges: moneyStringOrNull(payment.paidServiceCharges),
    paidTotalRent: moneyStringOrNull(payment.paidTotalRent)
  };
}

function moneyString(value: Prisma.Decimal | number | string) {
  return value.toString();
}

function moneyStringOrNull(value: Prisma.Decimal | number | string | null | undefined) {
  return value === null || value === undefined ? null : value.toString();
}

type RentPaymentLike = {
  id: string;
  unitId: string;
  tenantProfileId: string | null;
  year: number;
  month: number;
  expectedColdRent: Prisma.Decimal | number | string;
  expectedServiceCharges: Prisma.Decimal | number | string;
  expectedTotalRent: Prisma.Decimal | number | string;
  paidColdRent: Prisma.Decimal | number | string | null;
  paidServiceCharges: Prisma.Decimal | number | string | null;
  paidTotalRent: Prisma.Decimal | number | string | null;
  status: string;
  paidAt: Date | null;
  unit: {
    id: string;
    unitNumber: string;
    property: { id: string; name: string };
  };
  tenantProfile: unknown;
};
