import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

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
  status: z.enum(["OPEN", "PAID", "PARTIAL"])
});

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Ungueltige Daten.", issues: body.error.issues }, { status: 400 });

  const unit = await prisma.unit.findFirst({ where: { id: body.data.unitId, property: portalWhere(user) } });
  if (!unit) return NextResponse.json({ error: "Einheit nicht gefunden." }, { status: 404 });

  const paidTotalRent = body.data.status === "PAID" ? body.data.expectedTotalRent : body.data.paidTotalRent ?? 0;
  const ratio = body.data.expectedTotalRent > 0 ? paidTotalRent / body.data.expectedTotalRent : 0;
  const paidColdRent = body.data.status === "PAID" ? body.data.expectedColdRent : body.data.paidColdRent ?? Math.round(body.data.expectedColdRent * ratio * 100) / 100;
  const paidServiceCharges = body.data.status === "PAID" ? body.data.expectedServiceCharges : body.data.paidServiceCharges ?? Math.round(body.data.expectedServiceCharges * ratio * 100) / 100;

  const payment = await prisma.rentPayment.upsert({
    where: { unitId_year_month: { unitId: body.data.unitId, year: body.data.year, month: body.data.month } },
    update: {
      tenantProfileId: body.data.tenantProfileId || null,
      expectedColdRent: body.data.expectedColdRent,
      expectedServiceCharges: body.data.expectedServiceCharges,
      expectedTotalRent: body.data.expectedTotalRent,
      paidColdRent,
      paidServiceCharges,
      paidTotalRent,
      status: body.data.status,
      paidAt: body.data.status === "OPEN" ? null : new Date()
    },
    create: {
      unitId: body.data.unitId,
      tenantProfileId: body.data.tenantProfileId || null,
      year: body.data.year,
      month: body.data.month,
      expectedColdRent: body.data.expectedColdRent,
      expectedServiceCharges: body.data.expectedServiceCharges,
      expectedTotalRent: body.data.expectedTotalRent,
      paidColdRent,
      paidServiceCharges,
      paidTotalRent,
      status: body.data.status,
      paidAt: body.data.status === "OPEN" ? null : new Date()
    }
  });
  return NextResponse.json(payment);
}
