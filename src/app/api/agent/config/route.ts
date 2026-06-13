import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { ensureAgentConfig, saveAgentConfig } from "@/lib/agent";

const schema = z.object({
  systemPrompt: z.string().min(20),
  enabled: z.boolean().optional().default(true)
});

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  return NextResponse.json(await ensureAgentConfig(user.portalInstanceId));
}

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz: ungueltiger Ursprung." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Bitte Eingaben pruefen." }, { status: 400 });
  return NextResponse.json(await saveAgentConfig(user.portalInstanceId, parsed.data.systemPrompt, parsed.data.enabled));
}
