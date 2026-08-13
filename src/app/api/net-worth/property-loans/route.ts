import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

const mappingSchema = z.object({
  propertyId: z.string().min(1),
  bankingAccountId: z.coerce.number().int(),
  label: z.string().trim().optional()
});

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const items = await prisma.propertyLoanAccountMapping.findMany({
    where: { property: portalWhere(user) },
    include: { property: { select: { id: true, name: true, address: true } } },
    orderBy: { updatedAt: "desc" }
  });
  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz: ungueltiger Ursprung." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const parsed = mappingSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Bitte Angaben pruefen.", issues: parsed.error.issues }, { status: 400 });
  const property = await prisma.property.findFirst({ where: { id: parsed.data.propertyId, ...portalWhere(user) } });
  if (!property) return NextResponse.json({ error: "Immobilie nicht gefunden." }, { status: 404 });
  const item = await prisma.propertyLoanAccountMapping.upsert({
    where: { propertyId_bankingAccountId: { propertyId: parsed.data.propertyId, bankingAccountId: parsed.data.bankingAccountId } },
    create: {
      portalInstanceId: user.portalInstanceId,
      propertyId: parsed.data.propertyId,
      bankingAccountId: parsed.data.bankingAccountId,
      label: parsed.data.label || null
    },
    update: { label: parsed.data.label || null }
  });
  return NextResponse.json(item, { status: 201 });
}
