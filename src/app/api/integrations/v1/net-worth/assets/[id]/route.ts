import { NetWorthAssetType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
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
  const { user, response } = await requireIntegrationUser(request, ["write:settings"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;
  const existing = await prisma.netWorthAsset.findFirst({ where: { id: params.id, portalInstanceId: user.portalInstanceId ?? null } });
  if (!existing) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Nicht gefunden." } }, { status: 404 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Bitte Angaben pruefen.", issues: parsed.error.issues } }, { status: 400 });
  return NextResponse.json(await prisma.netWorthAsset.update({ where: { id: params.id }, data: parsed.data }));
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["write:settings"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;
  const existing = await prisma.netWorthAsset.findFirst({ where: { id: params.id, portalInstanceId: user.portalInstanceId ?? null } });
  if (!existing) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Nicht gefunden." } }, { status: 404 });
  await prisma.netWorthAsset.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
