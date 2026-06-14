import { type AgentConfig } from "@prisma/client";
import { z } from "zod";
import { AGENT_MEMORY_COLLECTION, createEmbedding, ensureVectorCollection, getAiConfig, qdrantRequest, vectorPointId } from "./ai-search";
import {
  executeValidatedToolCalls,
  toolListForPrompt,
  validateAgentToolCalls,
  type AgentArtifact,
  type AgentAttachment,
  type AgentToolCall,
  type AgentToolResult
} from "./agent-tools";
import { type ScopedUser } from "./portal-instance";
import { prisma } from "./prisma";
import { decryptSecret } from "./secrets";

export const DEFAULT_AGENT_SYSTEM_PROMPT = "Du bist ein Agent für ein Immobilienportal. Du hast die API-Dokumentation und die fachlichen Regeln als Kontext. Analysiere Nutzeranfragen: Bei fachlichen Aktionen wähle den passenden API-Endpunkt und führe ihn aus. Bei allgemeinen Fragen zum System beantworte sie basierend auf dem System-Prompt. Merke dir den Kontext, wie aktuelle Objekte, und greife auf gespeicherte Zusammenfassungen zurück, um sinnvoll zu reagieren.";

type AgentMessageInput = {
  user: ScopedUser;
  message: string;
  channel?: "web" | "telegram";
  conversationId?: string | null;
  externalKey?: string | null;
};

export type AgentStreamEvent =
  | { type: "status"; message: string }
  | { type: "tool_start"; tool: string; message: string }
  | { type: "tool_result"; tool: string; summary: string }
  | { type: "clarification"; message: string }
  | { type: "artifact"; artifact: AgentArtifact }
  | { type: "final"; answer: string; conversationId?: string | null; artifacts?: AgentArtifact[] }
  | { type: "error"; message: string };

type ProcessOptions = {
  onEvent?: (event: AgentStreamEvent) => void;
};

type ProviderMessage = {
  role: "user" | "assistant";
  content: string;
};

type AgentDecision =
  | { type: "tool_calls"; statusMessage?: string; toolCalls: AgentToolCall[] }
  | { type: "clarification"; message: string }
  | { type: "final_answer"; answer: string };

const decisionSchema = z.union([
  z.object({
    type: z.literal("tool_calls"),
    statusMessage: z.string().optional(),
    toolCalls: z.array(z.object({ tool: z.string(), args: z.record(z.unknown()).optional().default({}) })).default([])
  }),
  z.object({ type: z.literal("clarification"), message: z.string().min(1) }),
  z.object({ type: z.literal("final_answer"), answer: z.string().min(1) })
]);

export async function ensureAgentConfig(portalInstanceId: string | null) {
  const existing = await prisma.agentConfig.findFirst({ where: { portalInstanceId } });
  if (existing) return existing;
  return prisma.agentConfig.create({ data: { portalInstanceId, systemPrompt: DEFAULT_AGENT_SYSTEM_PROMPT } });
}

export async function saveAgentConfig(portalInstanceId: string | null, systemPrompt: string, enabled = true) {
  const existing = await prisma.agentConfig.findFirst({ where: { portalInstanceId } });
  const data = { systemPrompt: systemPrompt.trim() || DEFAULT_AGENT_SYSTEM_PROMPT, enabled };
  return existing
    ? prisma.agentConfig.update({ where: { id: existing.id }, data })
    : prisma.agentConfig.create({ data: { portalInstanceId, ...data } });
}

export async function resetAgentConversation(user: ScopedUser, conversationId?: string | null) {
  if (conversationId) {
    await prisma.agentConversation.deleteMany({ where: { id: conversationId, portalInstanceId: user.portalInstanceId } });
    return;
  }
  await prisma.agentConversation.deleteMany({ where: { portalInstanceId: user.portalInstanceId, userId: user.id, channel: "web" } });
}

export async function processAgentMessage(input: AgentMessageInput, options: ProcessOptions = {}) {
  const config = await ensureAgentConfig(input.user.portalInstanceId);
  if (!config.enabled) {
    return { conversationId: input.conversationId || null, answer: "Der Agent ist in den Einstellungen deaktiviert.", tools: [], artifacts: [], attachments: [] };
  }

  const conversation = await getOrCreateConversation(input);
  await prisma.agentMessage.create({ data: { conversationId: conversation.id, role: "user", content: input.message } });

  const [historyRows, memory] = await Promise.all([
    prisma.agentMessage.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: "asc" }, take: 40 }),
    searchAgentMemory(input.user, input.message, 8)
  ]);
  const history = historyRows
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({ role: message.role === "assistant" ? "assistant" as const : "user" as const, content: message.content }));

  options.onEvent?.({ type: "status", message: "Ich analysiere die Anfrage und plane die naechsten Schritte." });
  const agentResult = await runAgentLoop({
    config,
    user: input.user,
    channel: input.channel || "web",
    userMessage: input.message,
    history,
    memory,
    onEvent: options.onEvent
  });

  const assistantMessage = await prisma.agentMessage.create({ data: { conversationId: conversation.id, role: "assistant", content: agentResult.answer } });
  await prisma.agentConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
  await indexAgentMemory(input.user, conversation.id, `${input.message}\n${agentResult.answer}`, assistantMessage.id).catch((error) => console.error("Agent memory index failed", error));

  return {
    conversationId: conversation.id,
    answer: agentResult.answer,
    tools: agentResult.tools,
    artifacts: agentResult.artifacts,
    attachments: agentResult.attachments
  };
}

async function runAgentLoop(input: {
  config: AgentConfig;
  user: ScopedUser;
  channel: "web" | "telegram";
  userMessage: string;
  history: ProviderMessage[];
  memory: string[];
  onEvent?: (event: AgentStreamEvent) => void;
}) {
  const allToolCalls: AgentToolCall[] = [];
  const allToolResults: AgentToolResult[] = [];
  const maxToolRounds = 5;

  for (let round = 0; round < maxToolRounds; round++) {
    const decision = await planNextAgentStep({
      config: input.config,
      user: input.user,
      userMessage: input.userMessage,
      history: input.history,
      memory: input.memory,
      previousToolCalls: allToolCalls,
      previousToolResults: allToolResults
    });

    if (decision.type === "clarification") {
      input.onEvent?.({ type: "clarification", message: decision.message });
      return collectAgentOutput(decision.message, allToolResults);
    }

    if (decision.type === "final_answer") {
      if (!allToolResults.length && !canAnswerWithoutTools(input.userMessage)) {
        const fallback = fallbackDecision(input.userMessage, allToolResults);
        if (fallback.type === "tool_calls" && fallback.toolCalls.length) {
          if (fallback.statusMessage) input.onEvent?.({ type: "status", message: fallback.statusMessage });
          const validated = validateAgentToolCalls(fallback.toolCalls);
          const results = await executeValidatedToolCalls(
            { user: input.user, channel: input.channel },
            validated,
            (event) => input.onEvent?.(event.type === "tool_start"
              ? { type: "tool_start", tool: event.tool, message: event.message || `Ich fuehre ${event.tool} aus.` }
              : { type: "tool_result", tool: event.tool, summary: event.summary || "Erledigt." })
          );
          allToolCalls.push(...fallback.toolCalls);
          allToolResults.push(...results);
          continue;
        }
      }
      const final = await finalAnswer({
        config: input.config,
        user: input.user,
        userMessage: input.userMessage,
        history: input.history,
        memory: input.memory,
        toolCalls: allToolCalls,
        toolResults: allToolResults,
        forcedAnswer: decision.answer
      });
      return collectAgentOutput(final, allToolResults);
    }

    if (!decision.toolCalls.length) {
      const final = await finalAnswer({
        config: input.config,
        user: input.user,
        userMessage: input.userMessage,
        history: input.history,
        memory: input.memory,
        toolCalls: allToolCalls,
        toolResults: allToolResults
      });
      return collectAgentOutput(final, allToolResults);
    }

    if (decision.statusMessage) input.onEvent?.({ type: "status", message: decision.statusMessage });
    const validated = validateAgentToolCalls(decision.toolCalls);
    const results = await executeValidatedToolCalls(
      { user: input.user, channel: input.channel },
      validated,
      (event) => input.onEvent?.(event.type === "tool_start"
        ? { type: "tool_start", tool: event.tool, message: event.message || `Ich fuehre ${event.tool} aus.` }
        : { type: "tool_result", tool: event.tool, summary: event.summary || "Erledigt." })
    );
    allToolCalls.push(...decision.toolCalls);
    allToolResults.push(...results);
    for (const artifact of results.flatMap((result) => result.artifacts || [])) {
      input.onEvent?.({ type: "artifact", artifact });
    }
    if (results.some((result) => result.needsClarification)) {
      const answer = results.filter((result) => result.needsClarification).map((result) => result.summary).join("\n\n");
      return collectAgentOutput(answer, allToolResults);
    }
  }

  const answer = await finalAnswer({
    config: input.config,
    user: input.user,
    userMessage: input.userMessage,
    history: input.history,
    memory: input.memory,
    toolCalls: allToolCalls,
    toolResults: allToolResults
  });
  return collectAgentOutput(answer, allToolResults);
}

async function getOrCreateConversation(input: AgentMessageInput) {
  if (input.conversationId) {
    const existing = await prisma.agentConversation.findFirst({ where: { id: input.conversationId, portalInstanceId: input.user.portalInstanceId } });
    if (existing) return existing;
  }
  if (input.externalKey) {
    const existing = await prisma.agentConversation.findFirst({
      where: { portalInstanceId: input.user.portalInstanceId, channel: input.channel || "web", externalKey: input.externalKey }
    });
    if (existing) return existing;
  }
  return prisma.agentConversation.create({
    data: {
      portalInstanceId: input.user.portalInstanceId,
      userId: input.user.id,
      channel: input.channel || "web",
      externalKey: input.externalKey || null,
      title: input.message.slice(0, 80)
    }
  });
}

async function planNextAgentStep(input: {
  config: AgentConfig;
  user: ScopedUser;
  userMessage: string;
  history: ProviderMessage[];
  memory: string[];
  previousToolCalls: AgentToolCall[];
  previousToolResults: AgentToolResult[];
}): Promise<AgentDecision> {
  const system = [
    input.config.systemPrompt,
    "",
    "Du bist der interne Agent eines Immobilienportals. Deine Aufgabe ist, die naechsten Schritte zu planen.",
    "Du kennst ausschliesslich die bereitgestellten Tools. Du darfst keine Daten, IDs, Links oder Aktionen erfinden.",
    "Gib ausschliesslich valides JSON zurueck.",
    "",
    "Antwortformat:",
    '{"type":"tool_calls","statusMessage":"...","toolCalls":[{"tool":"search_tenants","args":{"query":"Mueller"}}]}',
    '{"type":"clarification","message":"..."}',
    '{"type":"final_answer","answer":"..."}',
    "",
    "Regeln:",
    "- Wenn Daten fehlen, nutze Suchtools.",
    "- Wenn mehrere Treffer moeglich sind, frage nach statt zu raten.",
    "- Schreibende Aktionen wie create_contract nur bei eindeutigem Mieter/Einheit/Vorlage oder wenn das Tool selbst eindeutig aufloesen kann.",
    "- Wenn bereits genug echte Tool-Ergebnisse vorliegen, formuliere final_answer.",
    "- Erfinde keine APIs, URLs, IDs oder Ergebnisse.",
    "",
    "Tools:",
    toolListForPrompt()
  ].join("\n");

  const context = [
    `Nutzeranfrage: ${input.userMessage}`,
    input.memory.length ? `Memory:\n${input.memory.join("\n---\n")}` : "Memory: keiner",
    input.previousToolCalls.length ? `Bisherige Tool Calls:\n${JSON.stringify(input.previousToolCalls, null, 2)}` : "Bisherige Tool Calls: keine",
    input.previousToolResults.length ? `Bisherige Tool Ergebnisse:\n${JSON.stringify(publicToolResults(input.previousToolResults), null, 2)}` : "Bisherige Tool Ergebnisse: keine"
  ].join("\n\n");

  const raw = await callAgentProvider(input.config, input.user, system, input.history, context, { json: true }).catch((error) => {
    console.error("Agent planning provider failed", error);
    return "";
  });
  const parsed = parseJsonDecision(raw);
  if (parsed) return parsed;
  return fallbackDecision(input.userMessage, input.previousToolResults);
}

async function finalAnswer(input: {
  config: AgentConfig;
  user: ScopedUser;
  userMessage: string;
  history: ProviderMessage[];
  memory: string[];
  toolCalls: AgentToolCall[];
  toolResults: AgentToolResult[];
  forcedAnswer?: string;
}) {
  if (input.toolResults.length) return fallbackAnswer(input.userMessage, input.toolResults);
  if (input.forcedAnswer && !input.toolResults.length) return input.forcedAnswer;
  const system = [
    input.config.systemPrompt,
    "",
    "Du bist der Portalagent eines Immobilienportals.",
    "Formuliere eine klare Antwort auf Deutsch.",
    "Nutze ausschliesslich echte Tool-Ergebnisse.",
    "Behaupte keine Aktion, die nicht erfolgreich ausgefuehrt wurde.",
    "Erfinde keine Links, IDs oder Dateien.",
    "Wenn mehrere Treffer gefunden wurden, bitte um Auswahl statt zu raten.",
    "Wenn ein Dokument, Vertrag oder PDF erzeugt wurde, nenne den echten Link oder die verfuegbare Aktion.",
    "Wenn Telegram-Dateiversand vorbereitet oder ausgefuehrt wurde, sage das nur, wenn ein Anhang vorhanden ist."
  ].join("\n");
  const prompt = [
    `Nutzeranfrage: ${input.userMessage}`,
    input.memory.length ? `Memory:\n${input.memory.join("\n---\n")}` : "Memory: keiner",
    input.toolCalls.length ? `Tool Calls:\n${JSON.stringify(input.toolCalls, null, 2)}` : "Tool Calls: keine",
    input.toolResults.length ? `Tool Ergebnisse:\n${JSON.stringify(publicToolResults(input.toolResults), null, 2)}` : "Tool Ergebnisse: keine",
    input.forcedAnswer ? `Vorlaeufige Antwort des Planers:\n${input.forcedAnswer}` : ""
  ].filter(Boolean).join("\n\n");
  const answer = await callAgentProvider(input.config, input.user, system, input.history, prompt).catch((error) => {
    console.error("Agent final provider failed", error);
    return "";
  });
  return answer || fallbackAnswer(input.userMessage, input.toolResults);
}

async function callAgentProvider(
  config: AgentConfig,
  user: ScopedUser,
  system: string,
  history: ProviderMessage[],
  message: string,
  options: { json?: boolean } = {}
) {
  const aiConfig = await getAiConfig(user.portalInstanceId);
  if (!aiConfig?.apiKeyEncrypted) return "";
  const key = decryptSecret(aiConfig.apiKeyEncrypted);
  if (aiConfig.provider === "gemini") return geminiChat(key, aiConfig.transcriptionModel || "gemini-1.5-flash", system, history, message);
  return openAiChat(key, chatModel(aiConfig.transcriptionModel), system, history, message, options.json);
}

async function openAiChat(apiKey: string, model: string, system: string, history: ProviderMessage[], message: string, json = false) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: json ? 0 : 0.2,
      response_format: json ? { type: "json_object" } : undefined,
      messages: [
        { role: "system", content: system },
        ...history.slice(-10),
        { role: "user", content: message }
      ]
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || "OpenAI Agent-Anfrage fehlgeschlagen.");
  return String(body.choices?.[0]?.message?.content || "").trim();
}

async function geminiChat(apiKey: string, model: string, system: string, history: ProviderMessage[], message: string) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [
        ...history.slice(-10).map((item) => ({ role: item.role === "assistant" ? "model" : "user", parts: [{ text: item.content }] })),
        { role: "user", parts: [{ text: message }] }
      ]
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || "Gemini Agent-Anfrage fehlgeschlagen.");
  return String(body.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join(" ") || "").trim();
}

function parseJsonDecision(raw: string): AgentDecision | null {
  if (!raw) return null;
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    return decisionSchema.parse(JSON.parse(cleaned)) as AgentDecision;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return decisionSchema.parse(JSON.parse(match[0])) as AgentDecision;
    } catch {
      return null;
    }
  }
}

export function fallbackDecisionForTest(message: string, previousResults: AgentToolResult[] = []): AgentDecision {
  return fallbackDecision(message, previousResults);
}

function fallbackDecision(message: string, previousResults: AgentToolResult[]): AgentDecision {
  if (previousResults.length) return { type: "final_answer", answer: fallbackAnswer(message, previousResults) };
  const normalized = normalize(message);
  if (/(mietvertrag|vertrag).*(mach|mache|erstelle|erzeug|generier)|(?:mach|mache|erstelle|erzeug|generier).*(mietvertrag|vertrag)/i.test(normalized)) {
    return { type: "tool_calls", statusMessage: "Ich suche Mieter, Einheit und Vorlage fuer den Mietvertrag.", toolCalls: [{ tool: "create_contract", args: { tenantQuery: message, propertyQuery: message, templateQuery: message } }] };
  }
  if (/wohn|geber|bestaetigung|bestätigung|melde/i.test(normalized) && /(mach|mache|erstelle|erzeug|generier)/i.test(normalized)) {
    return { type: "tool_calls", statusMessage: "Ich suche den Mieter fuer die Wohnungsgeberbestaetigung.", toolCalls: [{ tool: "create_landlord_confirmation", args: { tenantQuery: message } }] };
  }
  if (/(wohnt|bewohner|aktuell|mieter)/i.test(normalized)) {
    return { type: "tool_calls", statusMessage: "Ich suche aktuelle Mieter.", toolCalls: [{ tool: "search_tenants", args: { query: "", currentOnly: /aktuell|wohnt/i.test(normalized) } }] };
  }
  if (/(frei|wohnung|einheit)/i.test(normalized)) {
    return { type: "tool_calls", statusMessage: "Ich suche passende Einheiten.", toolCalls: [{ tool: "search_units", args: { query: message, propertyQuery: message } }] };
  }
  if (/(immobilie|objekt|haus|adresse)/i.test(normalized)) {
    return { type: "tool_calls", statusMessage: "Ich suche passende Immobilien.", toolCalls: [{ tool: "search_properties", args: { query: message } }] };
  }
  return { type: "tool_calls", statusMessage: "Ich suche im Portal.", toolCalls: [{ tool: "global_search", args: { query: message } }] };
}

function canAnswerWithoutTools(message: string) {
  return /^(hilfe|help|was kannst du|wer bist du|erklaer|erklär|wie funktioniert)/i.test(message.trim());
}

function collectAgentOutput(answer: string, tools: AgentToolResult[]) {
  return {
    answer,
    tools,
    artifacts: tools.flatMap((tool) => tool.artifacts || []),
    attachments: tools.flatMap((tool) => tool.attachments || [])
  };
}

function publicToolResults(results: AgentToolResult[]) {
  return results.map(({ attachments: _attachments, ...result }) => result);
}

function fallbackAnswer(message: string, tools: AgentToolResult[]) {
  if (tools.length) {
    return [
      "Ich habe dazu im Portal nachgesehen.",
      "",
      ...tools.map((tool) => tool.summary)
    ].join("\n");
  }
  if (/was kannst du|hilfe|funktionen/i.test(message)) {
    return "Ich kann Immobilien, Einheiten, Dokumente, Mieter und Verträge durchsuchen, Vertragsgenerierung anstoßen, Portal-Kontext merken und Fragen zur Bedienung beantworten. Für Aktionen nutze ich die vorhandenen Portal-Tools mit Rechteprüfung.";
  }
  return "Ich kann dazu im Portal suchen oder eine konkrete Aktion ausführen. Formuliere zum Beispiel: `Suche Grundbuch Musterstraße`, `Wer wohnt aktuell in meinen Objekten?` oder `Erstelle Mietvertrag für Müller in der Mainzer Straße`.";
}

async function indexAgentMemory(user: ScopedUser, conversationId: string, text: string, messageId: string) {
  await ensureVectorCollection(AGENT_MEMORY_COLLECTION);
  const vector = await createEmbedding(user.portalInstanceId, text);
  await qdrantRequest("PUT", `/collections/${AGENT_MEMORY_COLLECTION}/points?wait=true`, {
    points: [{
      id: vectorPointId(messageId),
      vector,
      payload: {
        portalInstanceId: user.portalInstanceId || "",
        conversationId,
        userId: user.id,
        text: text.slice(0, 3000),
        createdAt: new Date().toISOString()
      }
    }]
  });
}

async function searchAgentMemory(user: ScopedUser, query: string, limit: number) {
  await ensureVectorCollection(AGENT_MEMORY_COLLECTION);
  const vector = await createEmbedding(user.portalInstanceId, query);
  const result = await qdrantRequest<{ result?: Array<{ payload?: Record<string, unknown> }> }>("POST", `/collections/${AGENT_MEMORY_COLLECTION}/points/search`, {
    vector,
    limit,
    with_payload: true,
    score_threshold: 0.15,
    filter: { must: [{ key: "portalInstanceId", match: { value: user.portalInstanceId || "" } }] }
  }).catch(() => ({ result: [] }));
  return (result.result || []).map((item) => String(item.payload?.text || "")).filter(Boolean);
}

function chatModel(transcriptionModel: string) {
  if (transcriptionModel.includes("gpt-4") || transcriptionModel.includes("gpt-5")) return transcriptionModel.replace("-transcribe", "");
  return "gpt-4o-mini";
}

function normalize(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss");
}
