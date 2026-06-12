import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { getTelegramMe } from "@/lib/telegram";
import { encryptSecret } from "@/lib/secrets";
import { prisma } from "@/lib/prisma";

const saveSchema = z.object({
  token: z.string().trim().optional(),
  webhookEnabled: z.boolean().optional()
});

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const config = await prisma.telegramBotConfig.findFirst({ where: { portalInstanceId: user.portalInstanceId ?? null } });
  return NextResponse.json(redactConfig(config));
}

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz: ungueltiger Ursprung." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const parsed = saveSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Bitte Eingaben pruefen." }, { status: 400 });

  const existing = await prisma.telegramBotConfig.findFirst({ where: { portalInstanceId: user.portalInstanceId ?? null } });
  const data: { botTokenEncrypted?: string; botUsername?: string | null; webhookEnabled?: boolean } = {};
  if (parsed.data.token) {
    const me = await getTelegramMe(parsed.data.token);
    data.botTokenEncrypted = encryptSecret(parsed.data.token);
    data.botUsername = me.username || me.first_name || null;
  }
  if (typeof parsed.data.webhookEnabled === "boolean") data.webhookEnabled = parsed.data.webhookEnabled;
  if (!existing && !data.botTokenEncrypted) return NextResponse.json({ error: "Bitte zuerst Bot-Token speichern." }, { status: 400 });

  const config = existing
    ? await prisma.telegramBotConfig.update({ where: { id: existing.id }, data })
    : await prisma.telegramBotConfig.create({ data: { portalInstanceId: user.portalInstanceId ?? null, botTokenEncrypted: data.botTokenEncrypted!, botUsername: data.botUsername } });

  return NextResponse.json(redactConfig(config));
}

function redactConfig(config: Awaited<ReturnType<typeof prisma.telegramBotConfig.findUnique>>) {
  if (!config) return { configured: false };
  return {
    configured: true,
    botUsername: config.botUsername,
    chatId: config.chatId,
    chatTitle: config.chatTitle,
    threadId: config.threadId,
    threadTitle: config.threadTitle,
    pendingChatId: config.pendingChatId,
    pendingChatTitle: config.pendingChatTitle,
    pendingThreadId: config.pendingThreadId,
    pendingThreadTitle: config.pendingThreadTitle,
    pendingFrom: config.pendingFrom,
    pendingText: config.pendingText,
    pendingAt: config.pendingAt?.toISOString() || null,
    webhookEnabled: config.webhookEnabled
  };
}
