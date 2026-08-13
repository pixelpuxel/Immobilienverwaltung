import { NetWorthAssetType, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  type: z.nativeEnum(NetWorthAssetType).optional(),
  manualValue: z.preprocess((value) => value === "" || value === null || value === undefined ? null : value, z.coerce.number().nullable().optional()),
  bankingAccountId: z.preprocess((value) => value === "" || value === null || value === undefined ? null : value, z.coerce.number().int().nullable().optional()),
  bankingAccountLabel: z.string().trim().nullable().optional(),
  note: z.string().trim().nullable().optional(),
  active: z.boolean().optional()
});

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz: ungueltiger Ursprung." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const existing = await prisma.netWorthAsset.findFirst({ where: { id: params.id, portalInstanceId: user.portalInstanceId ?? null } });
  if (!existing) return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Bitte Angaben pruefen.", issues: parsed.error.issues }, { status: 400 });
  const updated = await prisma.netWorthAsset.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz: ungueltiger Ursprung." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const existing = await prisma.netWorthAsset.findFirst({ where: { id: params.id, portalInstanceId: user.portalInstanceId ?? null } });
  if (!existing) return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  await prisma.netWorthAsset.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
