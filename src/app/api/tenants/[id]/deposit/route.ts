import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

const money = z.preprocess((value) => value === "" || value === null || value === undefined ? null : value, z.coerce.number().nullable().optional());
const date = z.preprocess((value) => value === "" || value === null || value === undefined ? null : value, z.coerce.date().nullable().optional());

const schema = z.object({
  deposit: money,
  depositPaidAmount: money,
  depositPaidAt: date,
  depositReturnedAmount: money,
  depositReturnedAt: date,
  depositStatus: z.enum(["OPEN", "PAID", "PARTIAL_RETURNED", "RETURNED"]).default("OPEN")
});

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Ungueltige Daten.", issues: body.error.issues }, { status: 400 });
  const tenant = await prisma.tenantProfile.findFirst({ where: { id: params.id, user: portalWhere(user) } });
  if (!tenant) return NextResponse.json({ error: "Mieter wurde nicht gefunden." }, { status: 404 });
  const updated = await prisma.tenantProfile.update({ where: { id: tenant.id }, data: body.data });
  return NextResponse.json(updated);
}
