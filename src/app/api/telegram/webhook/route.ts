import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { decryptSecret } from "@/lib/secrets";
import { telegramApi } from "@/lib/telegram";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz: ungueltiger Ursprung." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const config = await prisma.telegramBotConfig.findFirst({ where: { portalInstanceId: user.portalInstanceId ?? null } });
  if (!config) return NextResponse.json({ error: "Bitte zuerst Bot-Token speichern." }, { status: 400 });
  const token = decryptSecret(config.botTokenEncrypted);
  const webhookUrl = `${env.appUrl.replace(/\/$/, "")}/api/telegram/webhook/${config.webhookSecret}`;
  await telegramApi(token, "setWebhook", {
    url: webhookUrl,
    allowed_updates: ["message", "edited_message", "channel_post"],
    drop_pending_updates: false
  });
  await prisma.telegramBotConfig.update({ where: { id: config.id }, data: { webhookEnabled: true } });
  return NextResponse.json({ ok: true, webhookUrl });
}

export async function DELETE(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz: ungueltiger Ursprung." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const config = await prisma.telegramBotConfig.findFirst({ where: { portalInstanceId: user.portalInstanceId ?? null } });
  if (!config) return NextResponse.json({ error: "Bitte zuerst Bot-Token speichern." }, { status: 400 });
  await telegramApi(decryptSecret(config.botTokenEncrypted), "deleteWebhook");
  await prisma.telegramBotConfig.update({ where: { id: config.id }, data: { webhookEnabled: false } });
  return NextResponse.json({ ok: true });
}
