import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { decryptSecret } from "@/lib/secrets";
import { integrationError, requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { telegramApi } from "@/lib/telegram";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["write:settings"]);
  if (response) return response;
  const adminError = requireAdminIntegration(user!);
  if (adminError) return adminError;

  const config = await prisma.telegramBotConfig.findFirst({ where: { portalInstanceId: user!.portalInstanceId ?? null } });
  if (!config) return integrationError("BAD_REQUEST", "Bitte zuerst Bot-Token speichern.", 400);
  const webhookUrl = `${env.appUrl.replace(/\/$/, "")}/api/telegram/webhook/${config.webhookSecret}`;
  await telegramApi(decryptSecret(config.botTokenEncrypted), "setWebhook", {
    url: webhookUrl,
    allowed_updates: ["message", "edited_message", "channel_post"],
    drop_pending_updates: false
  });
  await prisma.telegramBotConfig.update({ where: { id: config.id }, data: { webhookEnabled: true } });
  return NextResponse.json({ ok: true, webhookUrl });
}

export async function DELETE(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["write:settings"]);
  if (response) return response;
  const adminError = requireAdminIntegration(user!);
  if (adminError) return adminError;

  const config = await prisma.telegramBotConfig.findFirst({ where: { portalInstanceId: user!.portalInstanceId ?? null } });
  if (!config) return integrationError("BAD_REQUEST", "Bitte zuerst Bot-Token speichern.", 400);
  await telegramApi(decryptSecret(config.botTokenEncrypted), "deleteWebhook");
  await prisma.telegramBotConfig.update({ where: { id: config.id }, data: { webhookEnabled: false } });
  return NextResponse.json({ ok: true });
}
