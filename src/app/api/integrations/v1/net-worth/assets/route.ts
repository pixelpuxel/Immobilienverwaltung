import { NetWorthAssetType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { prisma } from "@/lib/prisma";

const assetSchema = z.object({
  name: z.string().trim().min(1),
  type: z.nativeEnum(NetWorthAssetType).default(NetWorthAssetType.ASSET),
  manualValue: z.preprocess((value) => value === "" || value === null || value === undefined ? null : value, z.coerce.number().nullable().optional()),
  bankingAccountId: z.preprocess((value) => value === "" || value === null || value === undefined ? null : value, z.coerce.number().int().nullable().optional()),
  bankingAccountLabel: z.string().trim().nullable().optional(),
  note: z.string().trim().nullable().optional(),
  active: z.boolean().optional()
});

export async function GET(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["read:properties"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;
  const items = await prisma.netWorthAsset.findMany({ where: { portalInstanceId: user.portalInstanceId ?? null }, orderBy: [{ active: "desc" }, { updatedAt: "desc" }] });
  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["write:settings"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;
  const parsed = assetSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Bitte Angaben pruefen.", issues: parsed.error.issues } }, { status: 400 });
  const item = await prisma.netWorthAsset.create({
    data: {
      portalInstanceId: user.portalInstanceId,
      name: parsed.data.name,
      type: parsed.data.type,
      manualValue: parsed.data.manualValue ?? null,
      bankingAccountId: parsed.data.bankingAccountId ?? null,
      bankingAccountLabel: parsed.data.bankingAccountLabel || null,
      note: parsed.data.note || null,
      active: parsed.data.active ?? true
    }
  });
  return NextResponse.json(item, { status: 201 });
}
