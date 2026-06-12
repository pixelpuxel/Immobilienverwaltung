import fs from "fs/promises";
import path from "path";
import { AuditAction, Role, type TelegramBotConfig } from "@prisma/client";
import { auditLog } from "./audit";
import { generateContract } from "./contracts";
import { readPrivateFile } from "./files";
import { globalSearch } from "./search";
import { decryptSecret } from "./secrets";
import { prisma } from "./prisma";

type TelegramMessage = {
  message_id: number;
  message_thread_id?: number;
  date?: number;
  text?: string;
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
    "/immobilien - Immobilien anzeigen",
    "/mieter [Name] - aktuelle Mieter anzeigen",
    "/dokumente <Begriff> - Dokumente suchen",
    "/vertraege [Name] - Mietvertraege suchen",
    "/vertrag <Mieter> - Mietvertrag erzeugen und PDF senden",
    "",
    "Beispiele:",
    "/suche Musterstraße",
    "/mieter Alina",
    "/vertrag Max"
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
      pendingText: text || "(keine Textnachricht)",
      pendingAt: message.date ? new Date(message.date * 1000) : new Date()
    }
  });

  const configuredChat = config.chatId;
  if (configuredChat && configuredChat !== chatId) return;
  if (configuredChat && config.threadId && config.threadId !== threadId) return;

  if (!text || /^\/?(start|hilfe|help)$/i.test(text)) {
    await sendTelegramMessage(token, chatId, telegramHelpText(), threadId);
    return;
  }

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

  const user = await botUser(config.portalInstanceId);
  if (!user) {
    await sendTelegramMessage(token, chatId, "Kein aktiver Eigentümer/Admin fuer diese Portalinstanz gefunden.", threadId);
    return;
  }

  try {
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
    await sendTelegramMessage(token, chatId, `Das habe ich nicht erkannt.\n\n${telegramHelpText()}`, threadId);
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
  const results = await globalSearch(user, query);
  if (!results.length) return `Keine Treffer fuer "${query}".`;
  return ["Treffer:", ...results.slice(0, 10).map((item) => `- ${item.type}: ${item.title}${item.description ? `\n  ${item.description}` : ""}`)].join("\n");
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
  const results = (await globalSearch(user, query)).filter((item) => item.type === "Dokument").slice(0, 10);
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
  const templates = await prisma.contractTemplate.findMany({ where: { portalInstanceId: config.portalInstanceId }, orderBy: { createdAt: "desc" } });
  const template = pickTemplate(templates, tenant.unit.property.name);
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
  const filePath = generated.pdfPath || generated.docxPath;
  await fs.access(filePath);
  await sendTelegramDocument(token, chatId, filePath, `Mietvertrag ${tenant.firstName} ${tenant.lastName}`, threadId);
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

function pickTemplate<T extends { name: string }>(templates: T[], propertyName: string) {
  const propertyKey = normalize(propertyName);
  return templates.find((item) => propertyKey && normalize(item.name).includes(propertyKey.split(" ")[0]))
    || templates.find((item) => propertyKey.includes("mainau") && normalize(item.name).includes("mainau"))
    || templates.find((item) => propertyKey.includes("tiroler") && normalize(item.name).includes("tiroler"))
    || templates[0]
    || null;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "short" }).format(value);
}
