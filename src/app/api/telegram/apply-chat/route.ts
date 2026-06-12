import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/secrets";
import { sendTelegramMessage, telegramHelpText } from "@/lib/telegram";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz: ungueltiger Ursprung." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const config = await prisma.telegramBotConfig.findFirst({ where: { portalInstanceId: user.portalInstanceId ?? null } });
  if (!config?.pendingChatId) return NextResponse.json({ error: "Keine erkannte Bot-Nachricht vorhanden." }, { status: 400 });
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
    await sendTelegramMessage(
      decryptSecret(updated.botTokenEncrypted),
      updated.chatId!,
      `Telegram-Verbindung ist aktiv.\n\n${telegramHelpText()}`,
      updated.threadId
    );
  } catch {
    // Die Konfiguration wurde trotzdem uebernommen; Fehler werden im UI beim naechsten Test sichtbar.
  }
  return NextResponse.json({
    chatId: updated.chatId,
    chatTitle: updated.chatTitle,
    threadId: updated.threadId,
    threadTitle: updated.threadTitle
  });
}
