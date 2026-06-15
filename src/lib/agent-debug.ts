import { prisma } from "./prisma";

type RunLogPatch = {
  systemPrompt?: string;
  modelContext?: unknown;
  modelResponses?: unknown;
  toolCalls?: unknown;
  toolResults?: unknown;
  finalAnswer?: string;
  error?: string;
};

export async function createAgentRunLog(input: {
  conversationId: string;
  portalInstanceId: string | null;
  userId: string | null;
  channel: string;
  userInput: string;
}) {
  return prisma.agentRunLog.create({
    data: {
      conversationId: input.conversationId,
      portalInstanceId: input.portalInstanceId,
      userId: input.userId,
      channel: input.channel,
      userInput: input.userInput
    }
  }).catch((error) => {
    console.error("Agent run log create failed", error);
    return null;
  });
}

export async function updateAgentRunLog(runLogId: string | null | undefined, patch: RunLogPatch) {
  if (!runLogId) return;
  let data = sanitizeForLog(patch) as any;
  if (Array.isArray(patch.modelResponses)) {
    const existing = await prisma.agentRunLog.findUnique({ where: { id: runLogId }, select: { modelResponses: true } }).catch(() => null);
    const previous = Array.isArray(existing?.modelResponses) ? existing.modelResponses : [];
    data = { ...data, modelResponses: [...previous, ...sanitizeForLog(patch.modelResponses)] };
  }
  if (patch.modelContext !== undefined) {
    const existing = await prisma.agentRunLog.findUnique({ where: { id: runLogId }, select: { modelContext: true } }).catch(() => null);
    const previous = Array.isArray(existing?.modelContext) ? existing.modelContext : existing?.modelContext ? [existing.modelContext] : [];
    data = { ...data, modelContext: [...previous, sanitizeForLog(patch.modelContext)] };
  }
  await prisma.agentRunLog.update({
    where: { id: runLogId },
    data
  }).catch((error) => console.error("Agent run log update failed", error));
}

export function sanitizeForLog<T>(value: T): T {
  return sanitize(value) as T;
}

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (/apiKey|token|secret|password|authorization/i.test(key)) {
      result[key] = "[redacted]";
    } else if (typeof raw === "string" && raw.length > 12000) {
      result[key] = `${raw.slice(0, 12000)}\n...[truncated]`;
    } else {
      result[key] = sanitize(raw);
    }
  }
  return result;
}
