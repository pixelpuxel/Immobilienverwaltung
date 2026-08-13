import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";
import { SERVICE_CHARGE_METHODS } from "@/lib/service-charge-allocation";

const schema = z.object({
  propertyId: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  method: z.enum(SERVICE_CHARGE_METHODS),
  totalDistributionValue: z.number().positive().nullable().optional(),
  note: z.string().max(2000).optional(),
  unitValues: z.record(z.number().min(0))
});

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const propertyId = request.nextUrl.searchParams.get("propertyId") || "";
  const year = Number(request.nextUrl.searchParams.get("year") || 0);
  const rule = await prisma.serviceChargeRule.findFirst({
    where: { propertyId, year, property: portalWhere(user) },
    include: { unitAllocations: true }
  });
  return NextResponse.json(rule);
}

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) {
    return NextResponse.json({ error: "CSRF-Schutz: ungueltiger Ursprung." }, { status: 403 });
  }
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Bitte Verteilerschluessel pruefen." }, { status: 400 });
  const property = await prisma.property.findFirst({
    where: { id: parsed.data.propertyId, ...portalWhere(user) },
    include: { units: { select: { id: true } } }
  });
  if (!property) return NextResponse.json({ error: "Immobilie wurde nicht gefunden." }, { status: 404 });
  const allowedUnitIds = new Set(property.units.map((unit) => unit.id));
  if (Object.keys(parsed.data.unitValues).some((unitId) => !allowedUnitIds.has(unitId))) {
    return NextResponse.json({ error: "Eine Einheit gehoert nicht zur Immobilie." }, { status: 422 });
  }
  const rule = await prisma.$transaction(async (tx) => {
    const saved = await tx.serviceChargeRule.upsert({
      where: { propertyId_year: { propertyId: property.id, year: parsed.data.year } },
      create: {
        portalInstanceId: user.portalInstanceId,
        propertyId: property.id,
        year: parsed.data.year,
        method: parsed.data.method,
        totalDistributionValue: parsed.data.totalDistributionValue,
        note: parsed.data.note
      },
      update: {
        method: parsed.data.method,
        totalDistributionValue: parsed.data.totalDistributionValue,
        note: parsed.data.note
      }
    });
    await tx.serviceChargeUnitAllocation.deleteMany({ where: { ruleId: saved.id } });
    const allocations = Object.entries(parsed.data.unitValues)
      .filter(([, value]) => value > 0)
      .map(([unitId, value]) => ({ ruleId: saved.id, unitId, value }));
    if (allocations.length) await tx.serviceChargeUnitAllocation.createMany({ data: allocations });
    return tx.serviceChargeRule.findUniqueOrThrow({
      where: { id: saved.id },
      include: { unitAllocations: true }
    });
  });
  return NextResponse.json(rule);
}
