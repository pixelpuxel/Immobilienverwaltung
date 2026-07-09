import { NextRequest, NextResponse } from "next/server";
import { decryptSecret } from "@/lib/secrets";
import { integrationError, requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { sendTelegramMessage, telegramHelpText } from "@/lib/telegram";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["write:settings"]);
  if (response) return response;
  const adminError = requireAdminIntegration(user!);
  if (adminError) return adminError;

  const config = await prisma.telegramBotConfig.findFirst({ where: { portalInstanceId: user!.portalInstanceId ?? null } });
  if (!config?.pendingChatId) return integrationError("BAD_REQUEST", "Keine erkannte Bot-Nachricht vorhanden.", 400);

  const updated = await prisma.telegramBotConfig.update({
    where: { id: config.id },
    data: {
      chatId: config.pendingChatId,
      chatTitle: config.pendingChatTitle,
      threadId: config.pendingThreadId,
      threadTitle: config.pendingThreadTitle
    }
  });

  try {
    await sendTelegramMessage(decryptSecret(updated.botTokenEncrypted), updated.chatId!, `Telegram-Verbindung ist aktiv.\n\n${telegramHelpText()}`, updated.threadId);
  } catch {
    // Die Konfiguration wurde trotzdem uebernommen.
  }

  return NextResponse.json({
    chatId: updated.chatId,
    chatTitle: updated.chatTitle,
    threadId: updated.threadId,
    threadTitle: updated.threadTitle
  });
}
