import { NetWorthAssetType, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
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
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const items = await prisma.netWorthAsset.findMany({
    where: { portalInstanceId: user.portalInstanceId ?? null },
    orderBy: [{ active: "desc" }, { updatedAt: "desc" }]
  });
  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz: ungueltiger Ursprung." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const parsed = assetSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Bitte Angaben pruefen.", issues: parsed.error.issues }, { status: 400 });
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
