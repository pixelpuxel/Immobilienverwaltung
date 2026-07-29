import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

const TREATMENTS = ["ALLOCABLE", "NON_ALLOCABLE", "RESERVE"] as const;
const createSchema = z.object({
  propertyId: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  unitId: z.string().min(1).nullable().optional(),
  description: z.string().trim().min(1).max(300),
  amount: z.number().finite().min(0),
  treatment: z.enum(TREATMENTS),
  sourceReference: z.string().trim().max(300).optional(),
  note: z.string().trim().max(2000).optional()
});

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) {
    return NextResponse.json({ error: "CSRF-Schutz: ungueltiger Ursprung." }, { status: 403 });
  }
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Bitte Kostenposition pruefen." }, { status: 400 });
  const rule = await prisma.serviceChargeRule.findFirst({
    where: {
      propertyId: parsed.data.propertyId,
      year: parsed.data.year,
      property: portalWhere(user)
    },
    include: { property: { include: { units: { select: { id: true } } } } }
  });
  if (!rule) return NextResponse.json({ error: "Zuerst Verteilerschluessel speichern." }, { status: 409 });
  if (parsed.data.unitId && !rule.property.units.some((unit) => unit.id === parsed.data.unitId)) {
    return NextResponse.json({ error: "Einheit gehoert nicht zur Immobilie." }, { status: 422 });
  }
  const line = await prisma.serviceChargeStatementLine.create({
    data: {
      portalInstanceId: user.portalInstanceId,
      ruleId: rule.id,
      unitId: parsed.data.unitId || null,
      description: parsed.data.description,
      amount: parsed.data.amount,
      treatment: parsed.data.treatment,
      sourceReference: parsed.data.sourceReference || null,
      note: parsed.data.note || null
    }
  });
  return NextResponse.json(line, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  if (!assertSameOrigin(request)) {
    return NextResponse.json({ error: "CSRF-Schutz: ungueltiger Ursprung." }, { status: 403 });
  }
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id") || "";
  const line = await prisma.serviceChargeStatementLine.findFirst({
    where: { id, rule: { property: portalWhere(user) } },
    select: { id: true }
  });
  if (!line) return NextResponse.json({ error: "Kostenposition nicht gefunden." }, { status: 404 });
  await prisma.serviceChargeStatementLine.delete({ where: { id: line.id } });
  return NextResponse.json({ deleted: true });
}
