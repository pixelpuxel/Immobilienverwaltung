import fs from "fs/promises";
import { AuditAction, Role, type AgentConfig } from "@prisma/client";
import { auditLog } from "./audit";
import { AGENT_MEMORY_COLLECTION, createEmbedding, ensureVectorCollection, getAiConfig, qdrantRequest, vectorPointId } from "./ai-search";
import { bestContractAttachment, contractPublicLinks } from "./contract-downloads";
import { contractTemplateCandidates, generateContract, selectContractTemplate } from "./contracts";
import { portalWhere, type ScopedUser } from "./portal-instance";
import { prisma } from "./prisma";
import { globalSearch } from "./search";
import { decryptSecret } from "./secrets";
import { generateWohnungsgeberbestaetigung } from "./wohnungsgeber";

export const DEFAULT_AGENT_SYSTEM_PROMPT = "Du bist ein Agent für ein Immobilienportal. Du hast die API-Dokumentation und die fachlichen Regeln als Kontext. Analysiere Nutzeranfragen: Bei fachlichen Aktionen wähle den passenden API-Endpunkt und führe ihn aus. Bei allgemeinen Fragen zum System beantworte sie basierend auf dem System-Prompt. Merke dir den Kontext, wie aktuelle Objekte, und greife auf gespeicherte Zusammenfassungen zurück, um sinnvoll zu reagieren.";

type AgentMessageInput = {
  user: ScopedUser;
  message: string;
  channel?: "web" | "telegram";
  conversationId?: string | null;
  externalKey?: string | null;
};

type AgentToolResult = {
  name: string;
  summary: string;
  href?: string;
  attachments?: Array<{ kind: "contract" | "document" | "wohnungsgeberbestaetigung"; format: "pdf" | "docx"; path: string; filename: string }>;
};

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

export async function processAgentMessage(input: AgentMessageInput) {
  const config = await ensureAgentConfig(input.user.portalInstanceId);
  if (!config.enabled) return { conversationId: input.conversationId || null, answer: "Der Agent ist in den Einstellungen deaktiviert.", tools: [] };

  const conversation = await getOrCreateConversation(input);
  await prisma.agentMessage.create({ data: { conversationId: conversation.id, role: "user", content: input.message } });

  const [history, memory, tools] = await Promise.all([
    prisma.agentMessage.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: "desc" }, take: 10 }),
    searchAgentMemory(input.user, input.message, 6),
    runAgentTools(input.user, input.message)
  ]);
  const answer = tools.find((tool) => tool.name.endsWith("_action"))?.summary
    || await answerWithProvider(config, input.user, input.message, history.reverse(), memory, tools);
  const assistantMessage = await prisma.agentMessage.create({ data: { conversationId: conversation.id, role: "assistant", content: answer } });
  await prisma.agentConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
  await indexAgentMemory(input.user, conversation.id, `${input.message}\n${answer}`, assistantMessage.id).catch((error) => console.error("Agent memory index failed", error));
  return { conversationId: conversation.id, answer, tools, attachments: tools.flatMap((tool) => tool.attachments || []) };
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

async function runAgentTools(user: ScopedUser, message: string): Promise<AgentToolResult[]> {
  const normalized = normalize(message);
  const tools: AgentToolResult[] = [];
  if (isContractCreationRequest(normalized)) {
    tools.push(await createContractAction(user, message));
    return tools;
  }
  if (/wohnungsgeber|geberbestaetigung|geberbestätigung|meldebestaetigung|meldebestätigung/i.test(normalized) && /(erstellen|anlegen|generieren|erzeugen)/i.test(normalized)) {
    tools.push(await createWohnungsgeberAction(user, message));
    return tools;
  }
  const searchNeeded = /\b(suche|finde|zeig|zeige|liste|uebersicht|übersicht|dokument|mieter|immobilie|vertrag|einheit)\b/i.test(normalized);
  if (searchNeeded || message.trim().length >= 2) {
    const results = await globalSearch(user, message);
    if (results.length) {
      tools.push({
        name: "portal_search",
        href: `/search?q=${encodeURIComponent(message)}`,
        summary: [
          `Portalweite Suche: ${results.length} Treffer.`,
          ...results.slice(0, 8).map((item) => `- ${item.type}: ${item.title}${item.description ? ` (${item.description})` : ""}\n  Link: ${item.href}`)
        ].join("\n")
      });
    }
  }
  if (/\b(immobilien|objekte|haeuser|häuser)\b/i.test(normalized)) {
    const properties = await prisma.property.findMany({ where: propertyScope(user), orderBy: { name: "asc" }, take: 12 });
    tools.push({ name: "properties", href: "/properties", summary: properties.length ? ["Immobilien:", ...properties.map((p) => `- ${p.name}: ${p.address}`)].join("\n") : "Keine Immobilien gefunden." });
  }
  if (/\b(mieter|bewohner)\b/i.test(normalized)) {
    const tenants = await prisma.tenantProfile.findMany({
      where: tenantScope(user),
      include: { unit: { include: { property: true } } },
      orderBy: [{ isCurrent: "desc" }, { lastName: "asc" }],
      take: 12
    });
    tools.push({ name: "tenants", href: "/users", summary: tenants.length ? ["Mieter:", ...tenants.map((t) => `- ${t.firstName} ${t.lastName}: ${t.unit ? `${t.unit.property.name} / ${t.unit.unitNumber}` : "keine Einheit"}`)].join("\n") : "Keine Mieter gefunden." });
  }
  return tools;
}

function isContractCreationRequest(normalizedMessage: string) {
  const hasContract = /\b(mietvertrag|vertrag|leasecontract)\b/i.test(normalizedMessage);
  const hasCreateVerb = /\b(erstelle|erstellen|erzeug|erzeuge|erzeugen|generier|generiere|generieren|anleg|anlege|anlegen|mach|mache)\b/i.test(normalizedMessage);
  return hasContract && hasCreateVerb;
}

async function createWohnungsgeberAction(user: ScopedUser, message: string): Promise<AgentToolResult> {
  if (user.role !== Role.ADMIN) {
    return { name: "wohnungsgeber_action", summary: "Ich kann Wohnungsgeberbestätigungen nur mit Eigentümer-/Adminrechten erzeugen." };
  }
  const testMode = /\b(test|testweise|testmodus)\b/i.test(normalize(message));
  const tenant = await findTenantForMessage(user, message);
  if (!tenant.match) {
    return { name: "wohnungsgeber_action", summary: `Ich habe keinen eindeutigen Mieter gefunden und deshalb keine Wohnungsgeberbestätigung erzeugt.\n${tenant.reason}` };
  }
  try {
    const document = await generateWohnungsgeberbestaetigung({ tenantProfileId: tenant.match.id, actorUserId: user.id });
    const summary = [
      testMode ? "Testmodus: Wohnungsgeberbestätigung wurde erzeugt, geprüft und danach wieder entfernt." : "Wohnungsgeberbestätigung wurde erzeugt.",
      `Mieter: ${tenantName(tenant.match)}`,
      tenant.match.unit ? `Immobilie: ${tenant.match.unit.property.name}` : null,
      tenant.match.unit ? `Einheit: ${tenant.match.unit.unitNumber}` : null,
      `Dokument-ID: ${document.id}`,
      `Vorschau-Link: /api/documents/${document.id}/preview`,
      `PDF-Link: /api/documents/${document.id}/download`
    ].filter(Boolean).join("\n");
    if (testMode) {
      await prisma.document.delete({ where: { id: document.id } }).catch(() => undefined);
      if (document.storagePath) await fs.rm(document.storagePath, { force: true }).catch(() => undefined);
      return { name: "wohnungsgeber_action", summary, attachments: [] };
    }
    return {
      name: "wohnungsgeber_action",
      summary,
      href: `/api/documents/${document.id}/preview`,
      attachments: document.storagePath ? [{ kind: "wohnungsgeberbestaetigung", format: "pdf", path: document.storagePath, filename: document.filename }] : []
    };
  } catch (error) {
    return { name: "wohnungsgeber_action", summary: error instanceof Error ? error.message : "Wohnungsgeberbestätigung konnte nicht erzeugt werden." };
  }
}

async function createContractAction(user: ScopedUser, message: string): Promise<AgentToolResult> {
  if (user.role !== Role.ADMIN) {
    return { name: "contract_action", summary: "Ich kann Mietverträge nur mit Eigentümer-/Adminrechten erzeugen." };
  }
  const testMode = /\b(test|testweise|testmodus)\b/i.test(normalize(message));
  const tenant = await findTenantForMessage(user, message);
  if (!tenant.match) {
    return {
      name: "contract_action",
      summary: [
        "Ich habe keinen eindeutigen Mieter gefunden und deshalb keinen Vertrag erzeugt.",
        tenant.reason,
        "Nutze für neue Mieter den geführten Telegram-Dialog `Erstelle Mietvertrag` oder lege den Mieter zuerst im Portal an."
      ].filter(Boolean).join("\n")
    };
  }
  const profile = tenant.match;
  if (!profile.unitId || !profile.unit) {
    return { name: "contract_action", summary: `Für ${tenantName(profile)} ist keine Einheit zugeordnet. Ich habe keinen Vertrag erzeugt.` };
  }
  const candidates = await contractTemplateCandidates({ portalInstanceId: user.portalInstanceId, propertyId: profile.unit.propertyId });
  const propertySpecific = candidates.filter((template) => template.propertyId === profile.unit!.propertyId);
  const globalTemplates = candidates.filter((template) => template.isGlobalTemplate && !template.propertyId);
  const selectableTemplates = propertySpecific.length ? propertySpecific : globalTemplates;
  const mentionedTemplate = findMentionedTemplate(selectableTemplates, message);
  if (!mentionedTemplate && selectableTemplates.length > 1) {
    const choices = selectableTemplates.map((template, index) => `${index + 1}. ${template.name}`).join("\n");
    return {
      name: "contract_action",
      summary: [
        "Ich habe mehrere passende Vorlagen gefunden und deshalb noch keinen Vertrag erzeugt.",
        choices,
        "Bitte nenne die gewünschte Vorlage eindeutig."
      ].join("\n")
    };
  }
  const template = mentionedTemplate || await selectContractTemplate({ portalInstanceId: user.portalInstanceId, propertyId: profile.unit.propertyId });
  const generated = await generateContract({ tenantProfileId: profile.id, unitId: profile.unitId, templateId: template?.id || null });
  const contract = await prisma.leaseContract.create({
    data: {
      tenantProfileId: profile.id,
      unitId: profile.unitId,
      templateId: template?.id || null,
      docxPath: generated.docxPath,
      pdfPath: generated.pdfPath
    }
  });
  await auditLog({ userId: user.id, action: AuditAction.CONTRACT_GENERATED, entity: "LeaseContract", entityId: contract.id, detail: { source: "agent", testMode } });
  const links = contractPublicLinks(contract.id, Boolean(generated.pdfPath), { absolute: true, signed: true, expiresInSeconds: 24 * 60 * 60 });
  const lines = [
    testMode ? "Testmodus: Vertrag wurde erzeugt, geprüft und danach wieder entfernt." : "Mietvertrag wurde erzeugt.",
    `Mieter: ${tenantName(profile)}`,
    `Immobilie: ${profile.unit.property.name}`,
    `Einheit: ${profile.unit.unitNumber}`,
    `Verwendete Vorlage: ${template?.name || "Interner Standardvertrag"}`,
    `Vertrags-ID: ${contract.id}`
  ];
  if (!testMode) {
    lines.push(
      `Vorschau-Link: ${links.preview}`,
      `DOCX-Link: ${links.docx}`,
      links.pdf ? `PDF-Link: ${links.pdf}` : "PDF-Link: PDF konnte nicht erzeugt werden, DOCX wurde bereitgestellt."
    );
  } else {
    lines.push("Download-Links: im Testmodus nicht dauerhaft, deshalb nicht ausgegeben.");
  }
  const attachment = bestContractAttachment(contract, `Mietvertrag_${tenantName(profile)}`);
  const attachments = [{ kind: "contract" as const, format: attachment.format, path: attachment.path, filename: attachment.filename }];
  if (testMode) {
    await prisma.leaseContract.delete({ where: { id: contract.id } }).catch(() => undefined);
    await fs.rm(generated.docxPath, { force: true }).catch(() => undefined);
    if (generated.pdfPath) await fs.rm(generated.pdfPath, { force: true }).catch(() => undefined);
    return { name: "contract_action", summary: lines.join("\n"), attachments: [] };
  }
  return { name: "contract_action", summary: lines.join("\n"), href: links.preview, attachments };
}

function findMentionedTemplate<T extends { name: string }>(templates: T[], message: string) {
  const normalizedMessage = normalize(message);
  const scored = templates
    .map((template) => {
      const normalizedName = normalize(template.name);
      const words = normalizedName.split(/[^a-z0-9]+/).filter((word) => word.length > 3);
      const score = normalizedMessage.includes(normalizedName) ? 100 : words.filter((word) => normalizedMessage.includes(word)).length;
      return { template, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.length && (scored.length === 1 || scored[0].score > scored[1].score) ? scored[0].template : null;
}

async function findTenantForMessage(user: ScopedUser, message: string) {
  const normalizedMessage = normalize(message);
  const tenants = await prisma.tenantProfile.findMany({
    where: { user: portalWhere(user) },
    include: { unit: { include: { property: true } } },
    orderBy: [{ isCurrent: "desc" }, { updatedAt: "desc" }],
    take: 200
  });
  const scored = tenants
    .map((tenant) => {
      const name = normalize(tenantName(tenant));
      const email = normalize(tenant.email || "");
      const score = (name && normalizedMessage.includes(name) ? 100 : 0)
        + name.split(/\s+/).filter((part) => part.length > 2 && normalizedMessage.includes(part)).length * 20
        + (email && normalizedMessage.includes(email) ? 50 : 0);
      return { tenant, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return { match: null, reason: "Kein vorhandener Mieter passt zur Anfrage." };
  if (scored.length > 1 && scored[0].score === scored[1].score) {
    return { match: null, reason: `Mehrere Mieter passen: ${scored.slice(0, 5).map((item) => tenantName(item.tenant)).join(", ")}.` };
  }
  return { match: scored[0].tenant, reason: "" };
}

function tenantName(tenant: { firstName: string; lastName: string; email?: string }) {
  return `${tenant.firstName} ${tenant.lastName}`.trim() || tenant.email || "Mieter";
}

async function answerWithProvider(config: AgentConfig, user: ScopedUser, message: string, history: Array<{ role: string; content: string }>, memory: string[], tools: AgentToolResult[]) {
  const aiConfig = await getAiConfig(user.portalInstanceId);
  const prompt = [
    config.systemPrompt,
    "",
    "Systemkontext:",
    apiContext(),
    "",
    memory.length ? `Gespeicherter Langzeitkontext:\n${memory.join("\n---\n")}` : "Gespeicherter Langzeitkontext: keiner",
    "",
    tools.length ? `Ausgefuehrte Aktionen/API-Kontext:\n${tools.map((tool) => `[${tool.name}]\n${tool.summary}`).join("\n\n")}` : "Ausgefuehrte Aktionen/API-Kontext: keine",
    "",
    "Antworte knapp, konkret und auf Deutsch. Wenn eine Aktion ausgefuehrt wurde, nenne das Ergebnis und sinnvolle naechste Schritte."
  ].join("\n");
  if (!aiConfig?.apiKeyEncrypted) return fallbackAnswer(message, tools, memory);
  const key = decryptSecret(aiConfig.apiKeyEncrypted);
  try {
    if (aiConfig.provider === "gemini") return await geminiChat(key, aiConfig.transcriptionModel || "gemini-1.5-flash", prompt, history, message);
    return await openAiChat(key, chatModel(aiConfig.transcriptionModel), prompt, history, message);
  } catch (error) {
    console.error("Agent provider failed", error);
    return fallbackAnswer(message, tools, memory);
  }
}

async function openAiChat(apiKey: string, model: string, system: string, history: Array<{ role: string; content: string }>, message: string) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        ...history.slice(-8).map((item) => ({ role: item.role === "assistant" ? "assistant" : "user", content: item.content })),
        { role: "user", content: message }
      ]
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || "OpenAI Agent-Anfrage fehlgeschlagen.");
  return String(body.choices?.[0]?.message?.content || "").trim() || fallbackAnswer(message, [], []);
}

async function geminiChat(apiKey: string, model: string, system: string, history: Array<{ role: string; content: string }>, message: string) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [
        ...history.slice(-8).map((item) => ({ role: item.role === "assistant" ? "model" : "user", parts: [{ text: item.content }] })),
        { role: "user", parts: [{ text: message }] }
      ]
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || "Gemini Agent-Anfrage fehlgeschlagen.");
  return String(body.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join(" ") || "").trim() || fallbackAnswer(message, [], []);
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

function fallbackAnswer(message: string, tools: AgentToolResult[], memory: string[]) {
  if (tools.length) {
    return [
      "Ich habe dazu im Portal nachgesehen.",
      "",
      ...tools.map((tool) => tool.summary),
      memory.length ? "\nIch habe außerdem passenden gespeicherten Kontext berücksichtigt." : ""
    ].filter(Boolean).join("\n");
  }
  if (/was kannst du|hilfe|funktionen/i.test(message)) {
    return "Ich kann Immobilien, Einheiten, Dokumente, Mieter und Verträge durchsuchen, Vertragsgenerierung anstoßen, Portal-Kontext merken und Fragen zur Bedienung beantworten. Für Aktionen nutze ich die vorhandenen Portal-API-Funktionen und Berechtigungen.";
  }
  return "Ich kann dazu im Portal suchen oder eine konkrete Aktion ausführen. Formuliere zum Beispiel: `Suche Grundbuch Musterstraße`, `Zeige aktuelle Mieter` oder `Erstelle Mietvertrag`.";
}

function apiContext() {
  return [
    "Wichtige Portal-Funktionen/API-Bereiche:",
    "- Immobilien: anzeigen, anlegen, bearbeiten, Kennzahlen auswerten.",
    "- Einheiten: Mieten, Nebenkosten, Warmmiete, aktuelle Mieter, WG-Faelle.",
    "- Dokumente: geschuetzte Vorschau/Downloads, Kategorien, Rechte, semantische Suche.",
    "- Mieter/Makler/Eigentuemer: Rollen- und Sichtrechte.",
    "- Mietvertraege: Vorlage waehlen, Platzhalter befuellen, DOCX erzeugen, PDF via LibreOffice erzeugen.",
    "- Telegram: Suche, Sprachnachrichten-Transkription, gefuehrte Mietvertragserstellung.",
    "- Einstellungen: AI-Provider, API-Key, Telegram, E-Mail, API-Tokens, Agent-System-Prompt."
  ].join("\n");
}

function propertyScope(user: ScopedUser) {
  if (user.role === Role.ADMIN) return portalWhere(user);
  if (user.role === Role.TENANT) return { units: { some: { tenants: { some: { userId: user.id } } } } };
  return { brokerRequests: { some: { userId: user.id, status: "active" } } };
}

function tenantScope(user: ScopedUser) {
  if (user.role === Role.ADMIN) return { user: portalWhere(user) };
  if (user.role === Role.BROKER) return { isCurrent: true, unit: { property: propertyScope(user) } };
  return { userId: user.id };
}

function chatModel(transcriptionModel: string) {
  if (transcriptionModel.includes("gpt-4") || transcriptionModel.includes("gpt-5")) return transcriptionModel.replace("-transcribe", "");
  return "gpt-4o-mini";
}

function normalize(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss");
}
