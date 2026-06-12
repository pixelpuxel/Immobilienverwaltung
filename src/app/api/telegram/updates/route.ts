import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { pollTelegramUpdates } from "@/lib/telegram";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz: ungueltiger Ursprung." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const config = await prisma.telegramBotConfig.findFirst({ where: { portalInstanceId: user.portalInstanceId ?? null } });
  if (!config) return NextResponse.json({ error: "Bitte zuerst Bot-Token speichern." }, { status: 400 });
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
