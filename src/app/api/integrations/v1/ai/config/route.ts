import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAiConfig, providerDefaults, saveAiConfig } from "@/lib/ai-search";
import { integrationError, requireIntegrationUser } from "@/lib/integration-auth";

const schema = z.object({
  provider: z.enum(["openai", "gemini"]),
  apiKey: z.string().trim().optional(),
  embeddingModel: z.string().trim().optional(),
  transcriptionModel: z.string().trim().optional()
});

export async function GET(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request);
  if (!user) return response;
  const forbidden = requireAdmin(user);
  if (forbidden) return forbidden;

  return NextResponse.json(redact(await getAiConfig(user.portalInstanceId)));
}

export async function PATCH(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["write:settings"]);
  if (!user) return response;
  const forbidden = requireAdmin(user);
  if (forbidden) return forbidden;

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return integrationError("BAD_REQUEST", "Bitte Eingaben pruefen.", 400);
  }
  const config = await saveAiConfig({ portalInstanceId: user.portalInstanceId, ...parsed.data });
  return NextResponse.json(redact(config));
}

function requireAdmin(user: { role: Role }) {
  if (user.role !== Role.ADMIN) {
    return integrationError("FORBIDDEN", "Dieser Endpunkt braucht einen Eigentuemer-Token.", 403);
  }
  return null;
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
