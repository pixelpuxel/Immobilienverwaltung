import { NextRequest, NextResponse } from "next/server";
import { integrationError, requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { pollTelegramUpdates } from "@/lib/telegram";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["write:settings"]);
  if (response) return response;
  const adminError = requireAdminIntegration(user!);
  if (adminError) return adminError;

  const config = await prisma.telegramBotConfig.findFirst({ where: { portalInstanceId: user!.portalInstanceId ?? null } });
  if (!config) return integrationError("BAD_REQUEST", "Bitte zuerst Bot-Token speichern.", 400);
  const updates = await pollTelegramUpdates(config);
  const refreshed = await prisma.telegramBotConfig.findUnique({ where: { id: config.id } });
  return NextResponse.json({
    count: updates.length,
    pendingChatId: refreshed?.pendingChatId || null,
    pendingChatTitle: refreshed?.pendingChatTitle || null,
    pendingThreadId: refreshed?.pendingThreadId || null,
    pendingThreadTitle: refreshed?.pendingThreadTitle || null,
    pendingFrom: refreshed?.pendingFrom || null,
    pendingText: refreshed?.pendingText || null,
    pendingAt: refreshed?.pendingAt?.toISOString() || null
  });
}
