import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { DEFAULT_AGENT_SYSTEM_PROMPT, ensureAgentConfig, saveAgentConfig } from "@/lib/agent";
import { integrationError, requireIntegrationUser } from "@/lib/integration-auth";

const schema = z.object({
  systemPrompt: z.string().min(20),
  enabled: z.boolean().optional().default(true)
});

export async function GET(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request);
  if (!user) return response;
  const forbidden = requireAdminPortalUser(user);
  if (forbidden) return forbidden;

  return NextResponse.json(serializeAgentConfig(await ensureAgentConfig(user.portalInstanceId)));
}

export async function PATCH(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["write:settings"]);
  if (!user) return response;
  const forbidden = requireAdminPortalUser(user);
  if (forbidden) return forbidden;

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return integrationError("BAD_REQUEST", "Bitte Eingaben pruefen.", 400);
  }

  const config = await saveAgentConfig(user.portalInstanceId, parsed.data.systemPrompt, parsed.data.enabled);
  return NextResponse.json(serializeAgentConfig(config));
}

function requireAdminPortalUser(user: { role: Role }) {
  if (user.role !== Role.ADMIN) {
    return integrationError("FORBIDDEN", "Dieser Endpunkt braucht einen Eigentuemer-Token.", 403);
  }
  return null;
}

function serializeAgentConfig(config: {
  id: string;
  systemPrompt: string;
  enabled: boolean;
  updatedAt: Date;
}) {
  return {
    id: config.id,
    systemPrompt: config.systemPrompt || DEFAULT_AGENT_SYSTEM_PROMPT,
    enabled: config.enabled,
    updatedAt: config.updatedAt
  };
}
