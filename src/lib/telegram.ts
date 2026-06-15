import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { AuditAction, Prisma, Role, type TelegramBotConfig } from "@prisma/client";
import { auditLog } from "./audit";
import { processAgentMessage, resetAgentConversation } from "./agent";
import { getAiConfig, semanticDocumentSearch, transcribeAudio } from "./ai-search";
import { hashPassword } from "./auth";
import { bestContractAttachment, contractPublicLinks } from "./contract-downloads";
import { generateContract, selectContractTemplate } from "./contracts";
import { readPrivateFile } from "./files";
import { globalSearch } from "./search";
import { decryptSecret } from "./secrets";
import { prisma } from "./prisma";

type TelegramMessage = {
  message_id: number;
  message_thread_id?: number;
  date?: number;
  text?: string;
  voice?: { file_id: string; mime_type?: string; file_unique_id?: string };
  audio?: { file_id: string; mime_type?: string; file_name?: string };
  chat: { id: number | string; type?: string; title?: string; username?: string; first_name?: string; last_name?: string };
  from?: { username?: string; first_name?: string; last_name?: string };
  forum_topic_created?: { name?: string };
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
};

type TelegramConfig = Pick<TelegramBotConfig,
  "id" | "portalInstanceId" | "botTokenEncrypted" | "chatId" | "threadId" | "webhookEnabled"
>;

export function telegramHelpText() {
  return [
    "Immobilienportal Bot",
    "",
    "Moegliche Befehle:",
    "/hilfe - diese Uebersicht",
    "/suche <Begriff> - portalweit suchen",
    "Sprachnachricht - transkribieren und suchen",
    "/immobilien - Immobilien anzeigen",
    "/mieter [Name] - aktuelle Mieter anzeigen",
    "/dokumente <Begriff> - Dokumente suchen",
    "/vertraege [Name] - Mietvertraege suchen",
    "/vertrag <Mieter> - Mietvertrag erzeugen und PDF senden",
    "/agent kontext - gespeicherten Agent-Kontext anzeigen",
    "/agent reset - Agent-Kontext fuer diesen Chat/Thread loeschen",
    "Erstelle Mietvertrag - gefuehrten Dialog fuer einen neuen Mietvertrag starten",
    "Freitext - Portal-Agent fragen oder Aktion ausfuehren lassen",
    "",
    "Agent-Themen:",
    "- Was kannst du?",
    "- Welche Immobilien gibt es?",
    "- Wer wohnt in der Kulturstraße?",
    "- Erstelle eine Wohnungsgeberbestaetigung fuer die Mieterin in der Kulturstraße",
    "- Suche Grundbuchauszug Musterstraße",
    "",
    "Beispiele:",
    "/suche Musterstraße",
    "/mieter Alina",
    "/vertrag Max",
    "Erstelle Mietvertrag"
  ].join("\n");
}

export async function telegramApi<T>(token: string, method: string, payload?: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: payload ? "POST" : "GET",
    headers: payload ? { "Content-Type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) {
    throw new Error(body.description || `Telegram ${method} fehlgeschlagen.`);
  }
  return body.result as T;
}

export async function getTelegramMe(token: string) {
  return telegramApi<{ id: number; is_bot: boolean; first_name: string; username?: string }>(token, "getMe");
}

export async function sendTelegramMessage(token: string, chatId: string, text: string, threadId?: string | null) {
  return telegramApi(token, "sendMessage", {
    chat_id: chatId,
    message_thread_id: threadId ? Number(threadId) : undefined,
    text,
    disable_web_page_preview: true
  });
}

export async function sendTelegramDocument(token: string, chatId: string, filePath: string, caption: string, threadId?: string | null) {
  const data = await readPrivateFile(filePath);
  const form = new FormData();
  form.set("chat_id", chatId);
  if (threadId) form.set("message_thread_id", threadId);
  form.set("caption", caption);
  form.set("document", new Blob([new Uint8Array(data)]), path.basename(filePath));
  const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: "POST", body: form });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) throw new Error(body.description || "Telegram-Dokument konnte nicht gesendet werden.");
  return body.result;
}

export async function pollTelegramUpdates(config: TelegramBotConfig) {
  const token = decryptSecret(config.botTokenEncrypted);
  const updates = await telegramApi<TelegramUpdate[]>(token, "getUpdates", {
    offset: config.lastUpdateId ? config.lastUpdateId + 1 : undefined,
    timeout: 0,
    allowed_updates: ["message", "edited_message", "channel_post"]
  });
  for (const update of updates) {
    await handleTelegramUpdate(config, update);
  }
  return updates;
}

export async function handleTelegramUpdate(config: TelegramConfig, update: TelegramUpdate) {
  const message = update.message || update.edited_message || update.channel_post;
  if (!message) return;

  const chatId = String(message.chat.id);
  const threadId = message.message_thread_id ? String(message.message_thread_id) : null;
  const chatTitle = chatLabel(message.chat);
  const from = senderLabel(message.from);
  const text = (message.text || "").trim();
  const token = decryptSecret(config.botTokenEncrypted);

  await prisma.telegramBotConfig.update({
    where: { id: config.id },
    data: {
      lastUpdateId: update.update_id,
      pendingChatId: chatId,
      pendingChatTitle: chatTitle,
      pendingThreadId: threadId,
      pendingThreadTitle: message.forum_topic_created?.name || null,
      pendingFrom: from,
      pendingText: text || (message.voice || message.audio ? "(Sprachnachricht)" : "(keine Textnachricht)"),
      pendingAt: message.date ? new Date(message.date * 1000) : new Date()
    }
  });

  const configuredChat = config.chatId;
  if (configuredChat && configuredChat !== chatId) return;
  if (configuredChat && config.threadId && config.threadId !== threadId) return;

  if (!configuredChat) {
    await sendTelegramMessage(token, chatId, [
      "Ich habe diesen Chat erkannt.",
      `Chat: ${chatTitle}`,
      `Chat-ID: ${chatId}`,
      threadId ? `Thread-ID: ${threadId}` : "Thread-ID: keine",
      "",
      "Bitte im Portal unter Einstellungen -> Telegram uebernehmen. Danach reagiere ich hier auf Befehle.",
      "",
      telegramHelpText()
    ].join("\n"), threadId);
    return;
  }

  if (!text && (message.voice || message.audio)) {
    await handleVoiceSearch(config, token, chatId, threadId, message);
    return;
  }

  if (!text || /^\/?(start|hilfe|help)$/i.test(text)) {
    await sendTelegramMessage(token, chatId, telegramHelpText(), threadId);
    return;
  }

  const user = await botUser(config.portalInstanceId);
  if (!user) {
    await sendTelegramMessage(token, chatId, "Kein aktiver Eigentümer/Admin fuer diese Portalinstanz gefunden.", threadId);
    return;
  }

  try {
    const activeConversation = await getContractConversation(config, chatId, threadId);
    if (/^\/agent\s+(kontext|context)$/i.test(text)) {
      await sendTelegramMessage(token, chatId, await agentContextReply(user, chatId, threadId), threadId);
      return;
    }
    if (/^\/agent\s+(reset|zuruecksetzen|zurücksetzen|loeschen|löschen)$/i.test(text)) {
      await resetTelegramAgentContext(user, chatId, threadId);
      await sendTelegramMessage(token, chatId, "Agent-Kontext fuer diesen Telegram-Chat wurde geloescht.", threadId);
      return;
    }
    if (activeConversation || isContractWizardStart(text)) {
      await handleContractWizard(config, token, chatId, threadId, user, text, Boolean(!activeConversation && isContractWizardStart(text)), activeConversation?.payload);
      return;
    }
    if (/^\/suche(?:\s+|$)/i.test(text)) {
      const query = arg(text);
      await sendTelegramMessage(token, chatId, await searchReply(user, query), threadId);
      return;
    }
    if (/^\/immobilien(?:\s+|$)/i.test(text)) {
      await sendTelegramMessage(token, chatId, await propertiesReply(config.portalInstanceId), threadId);
      return;
    }
    if (/^\/mieter(?:\s+|$)/i.test(text)) {
      await sendTelegramMessage(token, chatId, await tenantsReply(config.portalInstanceId, arg(text)), threadId);
      return;
    }
    if (/^\/dokumente(?:\s+|$)/i.test(text)) {
      await sendTelegramMessage(token, chatId, await documentsReply(user, arg(text)), threadId);
      return;
    }
    if (/^\/vertraege(?:\s+|$)/i.test(text)) {
      await sendTelegramMessage(token, chatId, await contractsReply(config.portalInstanceId, arg(text)), threadId);
      return;
    }
    if (/^\/vertrag(?:\s+|$)/i.test(text)) {
      await generateContractReply(config, token, chatId, threadId, arg(text), user.id);
      return;
    }
    if (text.startsWith("/")) {
      await sendTelegramMessage(token, chatId, `Das habe ich nicht erkannt.\n\n${telegramHelpText()}`, threadId);
      return;
    }
    await agentTelegramReply(token, user, text, chatId, threadId);
  } catch (error) {
    await sendTelegramMessage(token, chatId, error instanceof Error ? `Fehler: ${error.message}` : "Fehler bei der Verarbeitung.", threadId);
  }
}

async function botUser(portalInstanceId: string | null) {
  return prisma.user.findFirst({
    where: { role: Role.ADMIN, active: true, portalInstanceId },
    orderBy: [{ platformAdmin: "desc" }, { createdAt: "asc" }],
    select: { id: true, role: true, portalInstanceId: true, platformAdmin: true }
  });
}

async function searchReply(user: NonNullable<Awaited<ReturnType<typeof botUser>>>, query: string) {
  if (!query) return "Bitte Suchbegriff angeben, z.B. /suche Musterstraße.";
  const [semantic, structured] = await Promise.all([
    semanticDocumentSearch(user, query, 8).catch(() => []),
    globalSearch(user, query)
  ]);
  const results = mergeResults([...semantic, ...structured]);
  if (!results.length) return `Keine Treffer fuer "${query}".`;
  return ["Treffer:", ...results.slice(0, 10).map((item) => `- ${item.type}: ${item.title}${item.description ? `\n  ${item.description}` : ""}`)].join("\n");
}

async function handleVoiceSearch(config: TelegramConfig, token: string, chatId: string, threadId: string | null, message: TelegramMessage) {
  const fileId = message.voice?.file_id || message.audio?.file_id;
  if (!fileId) return;
  const aiConfig = await getAiConfig(config.portalInstanceId);
  const file = await telegramApi<{ file_path: string; file_size?: number }>(token, "getFile", { file_id: fileId });
  const fileResponse = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
  if (!fileResponse.ok) throw new Error("Telegram-Audio konnte nicht geladen werden.");
  const bytes = Buffer.from(await fileResponse.arrayBuffer());
  const mimeType = message.voice?.mime_type || message.audio?.mime_type || "audio/ogg";
  const filename = message.audio?.file_name || `telegram-voice.${mimeType.includes("mpeg") ? "mp3" : "ogg"}`;
  const transcript = await transcribeAudio(aiConfig, bytes, filename, mimeType);
  if (!transcript) {
    await sendTelegramMessage(token, chatId, "Ich konnte die Sprachnachricht nicht transkribieren.", threadId);
    return;
  }
  const user = await botUser(config.portalInstanceId);
  if (!user) {
    await sendTelegramMessage(token, chatId, "Kein aktiver Eigentümer/Admin fuer diese Portalinstanz gefunden.", threadId);
    return;
  }
  await sendTelegramMessage(token, chatId, `Transkription: ${transcript}`, threadId);
  await agentTelegramReply(token, user, transcript, chatId, threadId);
}

async function agentTelegramReply(token: string, user: NonNullable<Awaited<ReturnType<typeof botUser>>>, text: string, chatId: string, threadId: string | null) {
  const steps: string[] = [];
  const result = await processAgentMessage({
    user,
    message: text,
    channel: "telegram",
    externalKey: `${chatId}:${threadId || ""}`
  }, {
    onEvent: (event) => {
      const step = event.type === "status" || event.type === "tool_start"
        ? event.message
        : event.type === "tool_result"
          ? event.summary
          : event.type === "clarification"
            ? "Rueckfrage erforderlich."
            : event.type === "error"
              ? event.message
              : "";
      if (step) steps.push(step);
    }
  });
  if (steps.length) {
    await sendTelegramMessage(token, chatId, ["Agent-Lauf:", ...steps.slice(0, 12).map((step, index) => `${index + 1}. ${step}`)].join("\n"), threadId);
  }
  await sendTelegramMessage(token, chatId, result.answer, threadId);
  for (const attachment of result.attachments || []) {
    try {
      await sendTelegramDocument(token, chatId, attachment.path, attachment.filename, threadId);
    } catch (error) {
      await sendTelegramMessage(token, chatId, `Datei konnte nicht per Telegram gesendet werden: ${error instanceof Error ? error.message : "unbekannter Fehler"}`, threadId);
    }
  }
}

async function agentContextReply(user: NonNullable<Awaited<ReturnType<typeof botUser>>>, chatId: string, threadId: string | null) {
  const conversation = await prisma.agentConversation.findFirst({
    where: {
      portalInstanceId: user.portalInstanceId,
      channel: "telegram",
      externalKey: `${chatId}:${threadId || ""}`
    },
    include: {
      state: true,
      messages: { orderBy: { createdAt: "desc" }, take: 8 },
      runLogs: { orderBy: { createdAt: "desc" }, take: 3 }
    }
  });
  if (!conversation) return "Noch kein Agent-Kontext fuer diesen Telegram-Chat vorhanden.";
  return [
    "Agent-Kontext:",
    `Conversation: ${conversation.id}`,
    conversation.state ? `Status: ${conversation.state.status || "idle"}` : "Status: keiner",
    conversation.state?.goal ? `Ziel: ${conversation.state.goal}` : null,
    conversation.state?.pendingQuestion ? `Offene Frage: ${conversation.state.pendingQuestion}` : null,
    conversation.state?.facts ? `Bekannte Fakten: ${JSON.stringify(conversation.state.facts).slice(0, 1200)}` : "Bekannte Fakten: keine",
    "",
    "Letzte Nachrichten:",
    ...conversation.messages.reverse().map((message) => `- ${message.role}: ${message.content.slice(0, 350)}`),
    "",
    "Letzte Laeufe:",
    ...conversation.runLogs.map((log) => `- ${formatDate(log.createdAt)}: ${log.userInput.slice(0, 160)}${log.error ? ` (Fehler: ${log.error})` : ""}`),
    "",
    "Loeschen mit: /agent reset"
  ].filter(Boolean).join("\n");
}

async function resetTelegramAgentContext(user: NonNullable<Awaited<ReturnType<typeof botUser>>>, chatId: string, threadId: string | null) {
  const conversation = await prisma.agentConversation.findFirst({
    where: {
      portalInstanceId: user.portalInstanceId,
      channel: "telegram",
      externalKey: `${chatId}:${threadId || ""}`
    },
    select: { id: true }
  });
  if (conversation) {
    await resetAgentConversation(user, conversation.id);
  }
}

async function propertiesReply(portalInstanceId: string | null) {
  const properties = await prisma.property.findMany({
    where: { portalInstanceId },
    orderBy: { name: "asc" },
    take: 20,
    include: { units: { select: { id: true } } }
  });
  if (!properties.length) return "Keine Immobilien gefunden.";
  return ["Immobilien:", ...properties.map((property) => `- ${property.name} (${property.units.length} Einheiten)\n  ${property.address}`)].join("\n");
}

async function tenantsReply(portalInstanceId: string | null, query: string) {
  const tenants = await prisma.tenantProfile.findMany({
    where: {
      isCurrent: true,
      user: { portalInstanceId },
      ...(query ? { OR: [{ firstName: { contains: query, mode: "insensitive" } }, { lastName: { contains: query, mode: "insensitive" } }, { email: { contains: query, mode: "insensitive" } }] } : {})
    },
    include: { unit: { include: { property: true } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 20
  });
  if (!tenants.length) return query ? `Keine aktuellen Mieter zu "${query}" gefunden.` : "Keine aktuellen Mieter gefunden.";
  return ["Aktuelle Mieter:", ...tenants.map((tenant) => `- ${tenant.firstName} ${tenant.lastName}\n  ${tenant.unit ? `${tenant.unit.property.name} / ${tenant.unit.unitNumber}` : "keine Einheit"}`)].join("\n");
}

async function documentsReply(user: NonNullable<Awaited<ReturnType<typeof botUser>>>, query: string) {
  if (!query) return "Bitte Suchbegriff angeben, z.B. /dokumente Grundbuch.";
  const [semantic, structured] = await Promise.all([
    semanticDocumentSearch(user, query, 8).catch(() => []),
    globalSearch(user, query)
  ]);
  const results = mergeResults([...semantic, ...structured.filter((item) => item.type === "Dokument")]).slice(0, 10);
  if (!results.length) return `Keine Dokumente zu "${query}" gefunden.`;
  return ["Dokumente:", ...results.map((item) => `- ${item.title}${item.description ? `\n  ${item.description}` : ""}`)].join("\n");
}

async function contractsReply(portalInstanceId: string | null, query: string) {
  const contracts = await prisma.leaseContract.findMany({
    where: {
      unit: { property: { portalInstanceId } },
      ...(query ? { tenantProfile: { OR: [{ firstName: { contains: query, mode: "insensitive" } }, { lastName: { contains: query, mode: "insensitive" } }, { email: { contains: query, mode: "insensitive" } }] } } : {})
    },
    include: { tenantProfile: true, unit: { include: { property: true } }, template: true },
    orderBy: { createdAt: "desc" },
    take: 10
  });
  if (!contracts.length) return query ? `Keine Vertraege zu "${query}" gefunden.` : "Keine Vertraege gefunden.";
  return ["Mietvertraege:", ...contracts.map((contract) => `- ${contract.tenantProfile.firstName} ${contract.tenantProfile.lastName}\n  ${contract.unit.property.name} / ${contract.unit.unitNumber} · ${formatDate(contract.createdAt)}`)].join("\n");
}

async function generateContractReply(config: TelegramConfig, token: string, chatId: string, threadId: string | null, query: string, userId: string) {
  if (!query) {
    await sendTelegramMessage(token, chatId, "Bitte Mieter angeben, z.B. /vertrag Max.", threadId);
    return;
  }
  const tenants = await prisma.tenantProfile.findMany({
    where: { isCurrent: true, user: { portalInstanceId: config.portalInstanceId } },
    include: { unit: { include: { property: true } }, user: true }
  });
  const needle = normalize(query);
  const matches = tenants.filter((tenant) => normalize([tenant.firstName, tenant.lastName, tenant.email, tenant.user.username, tenant.unit?.unitNumber, tenant.unit?.property.name].filter(Boolean).join(" ")).includes(needle));
  if (!matches.length) {
    await sendTelegramMessage(token, chatId, `Kein aktueller Mieter zu "${query}" gefunden.`, threadId);
    return;
  }
  if (matches.length > 1) {
    await sendTelegramMessage(token, chatId, ["Mehrere Mieter gefunden. Bitte genauer suchen:", ...matches.slice(0, 10).map((tenant) => `- ${tenant.firstName} ${tenant.lastName} (${tenant.unit?.property.name || "ohne Immobilie"})`)].join("\n"), threadId);
    return;
  }
  const tenant = matches[0];
  if (!tenant.unit) {
    await sendTelegramMessage(token, chatId, `Bei ${tenant.firstName} ${tenant.lastName} ist keine Einheit hinterlegt.`, threadId);
    return;
  }
  await sendTelegramMessage(token, chatId, `Erzeuge Mietvertrag fuer ${tenant.firstName} ${tenant.lastName}...`, threadId);
  const template = await selectContractTemplate({ portalInstanceId: config.portalInstanceId, propertyId: tenant.unit.propertyId });
  const generated = await generateContract({ tenantProfileId: tenant.id, unitId: tenant.unitId!, templateId: template?.id || null });
  const contract = await prisma.leaseContract.create({
    data: {
      tenantProfileId: tenant.id,
      unitId: tenant.unitId!,
      templateId: template?.id || null,
      docxPath: generated.docxPath,
      pdfPath: generated.pdfPath
    }
  });
  await auditLog({ userId, action: AuditAction.CONTRACT_GENERATED, entity: "LeaseContract", entityId: contract.id, detail: { source: "telegram", tenant: `${tenant.firstName} ${tenant.lastName}` } });
  const attachment = bestContractAttachment({ docxPath: generated.docxPath, pdfPath: generated.pdfPath }, `Mietvertrag_${tenant.firstName}_${tenant.lastName}`);
  await fs.access(attachment.path);
  const links = contractPublicLinks(contract.id, Boolean(generated.pdfPath), { absolute: true, signed: true, expiresInSeconds: 24 * 60 * 60 });
  await sendTelegramMessage(token, chatId, [
    "Mietvertrag wurde erzeugt.",
    `Mieter: ${tenant.firstName} ${tenant.lastName}`,
    `Immobilie: ${tenant.unit.property.name}`,
    `Einheit: ${tenant.unit.unitNumber}`,
    `Verwendete Vorlage: ${template?.name || "Interner Standardvertrag"}`,
    `Vertrags-ID: ${contract.id}`,
    generated.pdfPath ? "PDF wurde als Datei gesendet." : "PDF konnte nicht erzeugt werden, DOCX wird als Datei gesendet.",
    `Download-Link: ${generated.pdfPath ? links.pdf : links.docx}`
  ].join("\n"), threadId);
  try {
    await sendTelegramDocument(token, chatId, attachment.path, `Mietvertrag ${tenant.firstName} ${tenant.lastName}`, threadId);
  } catch (error) {
    await sendTelegramMessage(token, chatId, `Telegram-Versand fehlgeschlagen: ${error instanceof Error ? error.message : "unbekannter Fehler"}`, threadId);
  }
}

type ContractWizardDraft = {
  tenantName?: string;
  propertyQuery?: string;
  propertyId?: string;
  propertyName?: string;
  unitQuery?: string;
  unitId?: string;
  unitNumber?: string;
  moveInDate?: string;
  leaseStartDate?: string;
  rentAmount?: number;
  garageRent?: number;
  serviceCharges?: number;
  warmRent?: number;
  email?: string;
  phone?: string;
  currentAddress?: string;
  deposit?: number;
  occupantCount?: number;
  specialAgreements?: string;
  expectedField?: string;
  awaitingConfirmation?: boolean;
  propertyChoices?: Array<{ id: string; label: string }>;
  unitChoices?: Array<{ id: string; label: string }>;
};

async function getContractConversation(config: TelegramConfig, chatId: string, threadId: string | null) {
  return prisma.telegramConversation.findUnique({
    where: { telegramBotConfigId_chatId_threadId: { telegramBotConfigId: config.id, chatId, threadId: threadId || "" } }
  });
}

async function saveContractConversation(config: TelegramConfig, chatId: string, threadId: string | null, draft: ContractWizardDraft) {
  const payload = jsonDraft(draft);
  return prisma.telegramConversation.upsert({
    where: { telegramBotConfigId_chatId_threadId: { telegramBotConfigId: config.id, chatId, threadId: threadId || "" } },
    update: { flow: "lease_contract", payload },
    create: { telegramBotConfigId: config.id, chatId, threadId: threadId || "", flow: "lease_contract", payload }
  });
}

async function clearContractConversation(config: TelegramConfig, chatId: string, threadId: string | null) {
  await prisma.telegramConversation.deleteMany({ where: { telegramBotConfigId: config.id, chatId, threadId: threadId || "", flow: "lease_contract" } });
}

function isContractWizardStart(text: string) {
  return /^erstelle\s+mietvertrag$/i.test(text.trim()) || /^mietvertrag\s+erstellen$/i.test(text.trim());
}

async function handleContractWizard(
  config: TelegramConfig,
  token: string,
  chatId: string,
  threadId: string | null,
  user: NonNullable<Awaited<ReturnType<typeof botUser>>>,
  text: string,
  isStart: boolean,
  storedPayload?: unknown
) {
  if (/^(abbrechen|stop|cancel)$/i.test(text.trim())) {
    await clearContractConversation(config, chatId, threadId);
    await sendTelegramMessage(token, chatId, "Mietvertragsdialog abgebrochen.", threadId);
    return;
  }

  let draft: ContractWizardDraft = storedPayload && typeof storedPayload === "object" ? { ...(storedPayload as ContractWizardDraft) } : {};
  if (isStart) {
    draft = {};
    await saveContractConversation(config, chatId, threadId, draft);
    await sendTelegramMessage(token, chatId, [
      "Ich erstelle einen Mietvertrag und frage die Daten nacheinander ab.",
      "Du kannst auch Beispielformen nutzen, z.B. `KM 850`, `WM 1100`, `Einzug 01.08.2026`.",
      "",
      "Wie heisst der Mieter?"
    ].join("\n"), threadId);
    return;
  }

  if (draft.awaitingConfirmation) {
    if (/^(ja|j|ok|okay|bestaetigen|bestätigen|erstellen)$/i.test(text.trim())) {
      await sendTelegramMessage(token, chatId, "Erzeuge Mietvertrag als PDF/DOCX...", threadId);
      const result = await createContractFromWizardDraft(config, draft, user.id);
      await clearContractConversation(config, chatId, threadId);
      await sendTelegramMessage(token, chatId, [
        "Mietvertrag wurde erzeugt.",
        `Mieter: ${result.tenantName}`,
        `Immobilie: ${result.propertyName}`,
        `Einheit: ${result.unitNumber}`,
        `Verwendete Vorlage: ${result.templateName}`,
        `Vertrags-ID: ${result.contractId}`,
        result.fileFormat === "pdf" ? "PDF wurde als Datei gesendet." : "PDF konnte nicht erzeugt werden, DOCX wird als Datei gesendet.",
        `Download-Link: ${result.downloadLink}`
      ].join("\n"), threadId);
      try {
        await sendTelegramDocument(token, chatId, result.filePath, `Mietvertrag ${result.tenantName}`, threadId);
      } catch (error) {
        await sendTelegramMessage(token, chatId, `Telegram-Versand fehlgeschlagen: ${error instanceof Error ? error.message : "unbekannter Fehler"}`, threadId);
      }
      return;
    }
    if (/^(nein|n|korrektur|aendern|ändern)$/i.test(text.trim())) {
      draft.awaitingConfirmation = false;
      draft.expectedField = nextMissingField(draft) || undefined;
      await saveContractConversation(config, chatId, threadId, draft);
      await sendTelegramMessage(token, chatId, `${questionForField(draft.expectedField)}\n\nAbbrechen mit: abbrechen`, threadId);
      return;
    }
    draft.awaitingConfirmation = false;
  }

  draft = applyContractText(draft, text);
  draft = await resolveWizardReferences(config.portalInstanceId, draft);
  const missing = nextMissingField(draft);
  if (missing) {
    draft.expectedField = missing;
    await saveContractConversation(config, chatId, threadId, draft);
    await sendTelegramMessage(token, chatId, `${questionForField(missing, draft)}\n\nBisher:\n${contractDraftSummary(draft, false)}\n\nAbbrechen mit: abbrechen`, threadId);
    return;
  }

  draft.awaitingConfirmation = true;
  draft.expectedField = undefined;
  await saveContractConversation(config, chatId, threadId, draft);
  await sendTelegramMessage(token, chatId, [
    "Bitte pruefen und bestaetigen:",
    "",
    contractDraftSummary(draft, true),
    "",
    "Antwort mit `ja` erzeugt den Mietvertrag als PDF. Mit `nein` kannst du korrigieren."
  ].join("\n"), threadId);
}

function applyContractText(draft: ContractWizardDraft, text: string) {
  const next = { ...draft };
  const raw = text.trim();
  const normalized = normalize(raw);

  if (next.expectedField === "propertyChoice") {
    applyNumberChoice(next, raw, "property");
    return next;
  }
  if (next.expectedField === "unitChoice") {
    applyNumberChoice(next, raw, "unit");
    return next;
  }

  const email = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  if (email) next.email = email.toLowerCase();

  const moneyPatterns: Array<[keyof ContractWizardDraft, RegExp]> = [
    ["rentAmount", /\b(?:km|kaltmiete|nettomiete)\b\s*[:=]?\s*([\d.,]+)/i],
    ["warmRent", /\b(?:wm|warmmiete|gesamtmiete)\b\s*[:=]?\s*([\d.,]+)/i],
    ["serviceCharges", /\b(?:nk|nebenkosten|betriebskosten|vorauszahlung)\b\s*[:=]?\s*([\d.,]+)/i],
    ["garageRent", /\b(?:tg|garage|tiefgarage|stellplatz)\b\s*[:=]?\s*([\d.,]+)/i],
    ["deposit", /\b(?:kaution|deposit)\b\s*[:=]?\s*([\d.,]+)/i]
  ];
  for (const [field, pattern] of moneyPatterns) {
    const value = parseMoney(raw.match(pattern)?.[1]);
    if (value !== null) (next[field] as number | undefined) = value;
  }

  const occupant = raw.match(/\b(?:bewohner|personen|anzahl bewohner)\b\s*[:=]?\s*(\d+)/i)?.[1];
  if (occupant) next.occupantCount = Number(occupant);

  const moveInText = raw.match(/\b(?:einzug|einzugsdatum|einziehen)\b\s*[:=]?\s*([0-9]{1,2}[./-][0-9]{1,2}(?:[./-][0-9]{2,4})?)/i)?.[1];
  const leaseText = raw.match(/\b(?:mietbeginn|vertragsbeginn|beginn)\b\s*[:=]?\s*([0-9]{1,2}[./-][0-9]{1,2}(?:[./-][0-9]{2,4})?)/i)?.[1];
  if (moveInText) next.moveInDate = parseDateInput(moveInText);
  if (leaseText) next.leaseStartDate = parseDateInput(leaseText);

  const tenantName = raw.match(/\b(?:mieter|name|mietername)\b\s*[:=]?\s*([^,\n;]+)/i)?.[1]?.trim();
  if (tenantName && !tenantName.includes("@")) next.tenantName = tenantName;

  const property = raw.match(/\b(?:objekt|immobilie|adresse)\b\s*[:=]?\s*([^,\n;]+)/i)?.[1]?.trim();
  if (property) {
    next.propertyQuery = property;
    next.propertyId = undefined;
    next.unitId = undefined;
  }

  const unit = raw.match(/\b(?:einheit|wohnung|wg|zimmer)\b\s*[:=]?\s*([^,\n;]+)/i)?.[1]?.trim();
  if (unit) {
    next.unitQuery = unit;
    next.unitId = undefined;
  }

  if (/\b(?:telefon|phone|tel)\b/i.test(normalized)) {
    const phone = raw.match(/(?:telefon|phone|tel)\s*[:=]?\s*([^,\n;]+)/i)?.[1]?.trim();
    if (phone) next.phone = phone;
  }

  if (/\b(?:vereinbarung|notiz|hinweis)\b/i.test(normalized)) {
    const note = raw.match(/(?:vereinbarung|notiz|hinweis)\s*[:=]?\s*([^]+)/i)?.[1]?.trim();
    if (note) next.specialAgreements = note;
  }

  applyExpectedField(next, raw);
  if (next.warmRent !== undefined && next.rentAmount !== undefined && next.serviceCharges === undefined) {
    const serviceCharges = next.warmRent - next.rentAmount - (next.garageRent || 0);
    if (serviceCharges >= 0) next.serviceCharges = Number(serviceCharges.toFixed(2));
  }
  if (!next.leaseStartDate && next.moveInDate) next.leaseStartDate = next.moveInDate;
  return next;
}

function applyExpectedField(draft: ContractWizardDraft, raw: string) {
  const field = draft.expectedField;
  if (!field) return;
  if (field === "tenantName" && !draft.tenantName) draft.tenantName = raw;
  if (field === "propertyQuery") {
    draft.propertyQuery = raw;
    draft.propertyId = undefined;
    draft.unitId = undefined;
  }
  if (field === "unitQuery") {
    draft.unitQuery = raw;
    draft.unitId = undefined;
  }
  if (field === "moveInDate" && !draft.moveInDate) draft.moveInDate = parseDateInput(raw);
  if (field === "rentAmount" && draft.rentAmount === undefined) draft.rentAmount = parseMoney(raw) ?? undefined;
  if (field === "warmRent" && draft.warmRent === undefined) draft.warmRent = parseMoney(raw) ?? undefined;
  if (field === "email" && !draft.email) draft.email = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase();
}

function applyNumberChoice(draft: ContractWizardDraft, raw: string, type: "property" | "unit") {
  const index = Number(raw.trim()) - 1;
  if (!Number.isInteger(index) || index < 0) return;
  if (type === "property") {
    const choice = draft.propertyChoices?.[index];
    if (!choice) return;
    draft.propertyId = choice.id;
    draft.propertyName = choice.label;
    draft.propertyChoices = undefined;
    draft.unitId = undefined;
    draft.unitNumber = undefined;
    draft.expectedField = undefined;
  } else {
    const choice = draft.unitChoices?.[index];
    if (!choice) return;
    draft.unitId = choice.id;
    draft.unitNumber = choice.label;
    draft.unitChoices = undefined;
    draft.expectedField = undefined;
  }
}

async function resolveWizardReferences(portalInstanceId: string | null, draft: ContractWizardDraft) {
  const next = { ...draft };
  if (!next.propertyId && next.propertyQuery) {
    const needle = normalize(next.propertyQuery);
    const properties = await prisma.property.findMany({
      where: { portalInstanceId },
      select: { id: true, name: true, address: true },
      orderBy: { name: "asc" },
      take: 50
    });
    const matches = properties.filter((property) => normalize(`${property.name} ${property.address}`).includes(needle) || needle.includes(normalize(property.name)));
    if (matches.length === 1) {
      next.propertyId = matches[0].id;
      next.propertyName = matches[0].name;
      next.propertyChoices = undefined;
    } else if (matches.length > 1) {
      next.propertyChoices = matches.slice(0, 8).map((property) => ({ id: property.id, label: `${property.name} - ${property.address}` }));
      next.expectedField = "propertyChoice";
    }
  }
  if (next.propertyId && !next.unitId) {
    const units = await prisma.unit.findMany({
      where: { propertyId: next.propertyId },
      select: { id: true, unitNumber: true, floor: true },
      orderBy: { unitNumber: "asc" }
    });
    if (units.length === 1 && !next.unitQuery) {
      next.unitId = units[0].id;
      next.unitNumber = units[0].unitNumber;
      next.unitChoices = undefined;
    } else if (next.unitQuery) {
      const unitNeedle = normalize(next.unitQuery);
      const matches = units.filter((unit) => normalize(`${unit.unitNumber} ${unit.floor || ""}`).includes(unitNeedle) || unitNeedle.includes(normalize(unit.unitNumber)));
      if (matches.length === 1) {
        next.unitId = matches[0].id;
        next.unitNumber = matches[0].unitNumber;
        next.unitChoices = undefined;
      } else if (matches.length > 1) {
        next.unitChoices = matches.slice(0, 10).map((unit) => ({ id: unit.id, label: [unit.unitNumber, unit.floor].filter(Boolean).join(" / ") }));
        next.expectedField = "unitChoice";
      }
    } else if (units.length > 1) {
      next.unitChoices = units.slice(0, 10).map((unit) => ({ id: unit.id, label: [unit.unitNumber, unit.floor].filter(Boolean).join(" / ") }));
    }
  }
  return next;
}

function nextMissingField(draft: ContractWizardDraft) {
  if (draft.propertyChoices?.length && !draft.propertyId) return "propertyChoice";
  if (!draft.tenantName) return "tenantName";
  if (!draft.propertyId) return "propertyQuery";
  if (draft.unitChoices?.length && !draft.unitId) return "unitChoice";
  if (!draft.unitId) return "unitQuery";
  if (!draft.moveInDate) return "moveInDate";
  if (draft.rentAmount === undefined) return "rentAmount";
  if (draft.warmRent === undefined && draft.serviceCharges === undefined) return "warmRent";
  if (!draft.email) return "email";
  return null;
}

function questionForField(field?: string | null, draft?: ContractWizardDraft) {
  if (field === "propertyChoice") return ["Ich habe mehrere Immobilien gefunden. Bitte Nummer antworten:", ...(draft?.propertyChoices || []).map((choice, index) => `${index + 1}. ${choice.label}`)].join("\n");
  if (field === "unitChoice") return ["Welche Einheit soll verwendet werden? Bitte Nummer antworten:", ...(draft?.unitChoices || []).map((choice, index) => `${index + 1}. ${choice.label}`)].join("\n");
  if (field === "tenantName") return "Wie heisst der Mieter?";
  if (field === "propertyQuery") return "Für welches Objekt soll der Mietvertrag erstellt werden?";
  if (field === "unitQuery") return "Welche Einheit/Wohnung ist gemeint?";
  if (field === "moveInDate") return "Wie lautet das Einzugsdatum? Beispiel: 01.08.2026";
  if (field === "rentAmount") return "Wie hoch ist die Kaltmiete? Beispiel: KM 850";
  if (field === "warmRent") return "Wie hoch ist die Warmmiete oder alternativ die Nebenkosten? Beispiel: WM 1100 oder NK 250";
  if (field === "email") return "Welche E-Mail-Adresse soll beim Mieter hinterlegt werden?";
  return "Bitte fehlende Angabe senden.";
}

async function createContractFromWizardDraft(config: TelegramConfig, draft: ContractWizardDraft, userId: string) {
  if (!draft.tenantName || !draft.unitId || !draft.email || !draft.moveInDate || draft.rentAmount === undefined) {
    throw new Error("Es fehlen noch Pflichtdaten fuer den Mietvertrag.");
  }
  const unit = await prisma.unit.findUniqueOrThrow({ where: { id: draft.unitId }, include: { property: true } });
  if (unit.property.portalInstanceId !== config.portalInstanceId) throw new Error("Einheit gehoert nicht zu dieser Portalinstanz.");
  const { firstName, lastName } = splitTenantName(draft.tenantName);
  const normalizedEmail = draft.email.toLowerCase();
  const displayName = `${firstName} ${lastName}`.trim();
  const existingUser = await prisma.user.findFirst({ where: { email: normalizedEmail } });
  if (existingUser?.portalInstanceId && existingUser.portalInstanceId !== config.portalInstanceId) {
    throw new Error("Diese E-Mail-Adresse gehoert zu einer anderen Portalinstanz.");
  }
  const tenantUser = existingUser
    ? await prisma.user.update({ where: { id: existingUser.id }, data: { portalInstanceId: config.portalInstanceId, name: displayName, role: Role.TENANT, active: true } })
    : await prisma.user.create({
      data: {
        email: normalizedEmail,
        username: uniqueUsername(firstName, lastName),
        portalInstanceId: config.portalInstanceId,
        name: displayName,
        role: Role.TENANT,
        active: true,
        passwordHash: await hashPassword(crypto.randomBytes(18).toString("base64url"))
      }
    });
  const serviceCharges = draft.serviceCharges ?? (draft.warmRent !== undefined ? Number((draft.warmRent - draft.rentAmount - (draft.garageRent || 0)).toFixed(2)) : null);
  const profile = await prisma.tenantProfile.upsert({
    where: { userId: tenantUser.id },
    update: {
      unitId: unit.id,
      firstName,
      lastName,
      email: normalizedEmail,
      phone: draft.phone,
      currentAddress: draft.currentAddress,
      moveInDate: parseDateStrict(draft.moveInDate),
      leaseStartDate: parseDateStrict(draft.leaseStartDate || draft.moveInDate),
      isCurrent: true,
      rentAmount: draft.rentAmount,
      garageRent: draft.garageRent ?? null,
      serviceCharges: serviceCharges !== null && serviceCharges >= 0 ? serviceCharges : null,
      deposit: draft.deposit ?? null,
      occupantCount: draft.occupantCount ?? null,
      specialAgreements: draft.specialAgreements
    },
    create: {
      userId: tenantUser.id,
      unitId: unit.id,
      firstName,
      lastName,
      email: normalizedEmail,
      phone: draft.phone,
      currentAddress: draft.currentAddress,
      moveInDate: parseDateStrict(draft.moveInDate),
      leaseStartDate: parseDateStrict(draft.leaseStartDate || draft.moveInDate),
      isCurrent: true,
      rentAmount: draft.rentAmount,
      garageRent: draft.garageRent ?? null,
      serviceCharges: serviceCharges !== null && serviceCharges >= 0 ? serviceCharges : null,
      deposit: draft.deposit ?? null,
      occupantCount: draft.occupantCount ?? null,
      specialAgreements: draft.specialAgreements
    }
  });
  if (!unit.isSharedHousing) {
    await prisma.tenantProfile.updateMany({
      where: { unitId: unit.id, id: { not: profile.id } },
      data: { isCurrent: false, moveOutDate: parseDateStrict(draft.moveInDate) }
    });
  }
  const template = await selectContractTemplate({ portalInstanceId: config.portalInstanceId, propertyId: unit.propertyId });
  const generated = await generateContract({ tenantProfileId: profile.id, unitId: unit.id, templateId: template?.id || null });
  const contract = await prisma.leaseContract.create({
    data: {
      tenantProfileId: profile.id,
      unitId: unit.id,
      templateId: template?.id || null,
      docxPath: generated.docxPath,
      pdfPath: generated.pdfPath
    }
  });
  await auditLog({ userId, action: AuditAction.CONTRACT_GENERATED, entity: "LeaseContract", entityId: contract.id, detail: { source: "telegram-wizard", tenant: displayName } });
  const attachment = bestContractAttachment(contract, `Mietvertrag_${displayName}`);
  await fs.access(attachment.path);
  const links = contractPublicLinks(contract.id, Boolean(contract.pdfPath), { absolute: true, signed: true, expiresInSeconds: 24 * 60 * 60 });
  return {
    filePath: attachment.path,
    fileFormat: attachment.format,
    downloadLink: attachment.format === "pdf" ? links.pdf! : links.docx,
    tenantName: displayName,
    templateName: template?.name || "Interner Standardvertrag",
    propertyName: unit.property.name,
    unitNumber: unit.unitNumber,
    contractId: contract.id
  };
}

function contractDraftSummary(draft: ContractWizardDraft, final: boolean) {
  return [
    `Mieter: ${draft.tenantName || "-"}`,
    `Objekt: ${draft.propertyName || draft.propertyQuery || "-"}`,
    `Einheit: ${draft.unitNumber || draft.unitQuery || "-"}`,
    `Einzug: ${formatDraftDate(draft.moveInDate) || "-"}`,
    `Mietbeginn: ${formatDraftDate(draft.leaseStartDate || draft.moveInDate) || "-"}`,
    `Kaltmiete: ${formatMoney(draft.rentAmount)}`,
    draft.garageRent !== undefined ? `Tiefgarage/Stellplatz: ${formatMoney(draft.garageRent)}` : null,
    draft.serviceCharges !== undefined ? `Nebenkosten: ${formatMoney(draft.serviceCharges)}` : null,
    `Warmmiete: ${formatMoney(draft.warmRent ?? (draft.rentAmount !== undefined && draft.serviceCharges !== undefined ? draft.rentAmount + (draft.garageRent || 0) + draft.serviceCharges : undefined))}`,
    draft.deposit !== undefined ? `Kaution: ${formatMoney(draft.deposit)}` : null,
    `E-Mail: ${draft.email || "-"}`,
    draft.phone ? `Telefon: ${draft.phone}` : null,
    draft.specialAgreements ? `Besondere Vereinbarungen: ${draft.specialAgreements}` : null,
    final ? "Versand: PDF direkt in diesen Telegram-Chat, keine E-Mail." : null
  ].filter(Boolean).join("\n");
}

function splitTenantName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1) || "" };
}

function parseMoney(value?: string | null) {
  if (!value) return null;
  const normalizedValue = value.replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const parsed = Number(normalizedValue);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDateInput(value: string) {
  const parsed = parseDateStrict(value);
  return parsed ? parsed.toISOString().slice(0, 10) : undefined;
}

function parseDateStrict(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?$/);
  if (!match) {
    const direct = new Date(trimmed);
    return Number.isNaN(direct.getTime()) ? null : direct;
  }
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = match[3] ? Number(match[3].length === 2 ? `20${match[3]}` : match[3]) : new Date().getFullYear();
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDraftDate(value?: string) {
  const date = parseDateStrict(value);
  return date ? formatDate(date) : "";
}

function formatMoney(value?: number) {
  if (value === undefined || value === null) return "-";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function uniqueUsername(firstName: string, lastName: string) {
  const base = normalize(`${firstName}-${lastName}`)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "mieter";
  return `${base}-${Date.now().toString(36).slice(-5)}`;
}

function jsonDraft(draft: ContractWizardDraft): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(draft)) as Prisma.InputJsonObject;
}

function arg(text: string) {
  return text.replace(/^\/\S+\s*/i, "").trim();
}

function chatLabel(chat: TelegramMessage["chat"]) {
  return chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(" ") || chat.username || String(chat.id);
}

function senderLabel(from?: TelegramMessage["from"]) {
  if (!from) return null;
  return from.username ? `@${from.username}` : [from.first_name, from.last_name].filter(Boolean).join(" ") || null;
}

function normalize(value: unknown) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss");
}


function formatDate(value: Date) {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "short" }).format(value);
}

function mergeResults<T extends { type: string; href: string; title: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.type}:${item.href}:${item.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
