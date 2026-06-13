import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { getAiConfig, providerDefaults, saveAiConfig } from "@/lib/ai-search";

const schema = z.object({
  provider: z.enum(["openai", "gemini"]),
  apiKey: z.string().trim().optional(),
  embeddingModel: z.string().trim().optional(),
  transcriptionModel: z.string().trim().optional()
});

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const config = await getAiConfig(user.portalInstanceId);
  return NextResponse.json(redact(config));
}

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz: ungueltiger Ursprung." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Bitte Eingaben pruefen." }, { status: 400 });
  const config = await saveAiConfig({ portalInstanceId: user.portalInstanceId, ...parsed.data });
  return NextResponse.json(redact(config));
}

function redact(config: Awaited<ReturnType<typeof getAiConfig>>) {
  if (!config) {
    const defaults = providerDefaults("openai");
    return { configured: false, provider: "openai", ...defaults };
  }
  return {
    configured: Boolean(config.apiKeyEncrypted),
    provider: config.provider,
    embeddingModel: config.embeddingModel,
    transcriptionModel: config.transcriptionModel
  };
}
