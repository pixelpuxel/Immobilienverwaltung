import { NextRequest, NextResponse } from "next/server";
import { handleTelegramUpdate, type TelegramUpdate } from "@/lib/telegram";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest, { params }: { params: { secret: string } }) {
  const config = await prisma.telegramBotConfig.findFirst({ where: { webhookSecret: params.secret } });
  if (!config) return NextResponse.json({ ok: false }, { status: 404 });
  const update = await request.json().catch(() => null) as TelegramUpdate | null;
  if (!update) return NextResponse.json({ ok: false }, { status: 400 });
  await handleTelegramUpdate(config, update);
  return NextResponse.json({ ok: true });
}
