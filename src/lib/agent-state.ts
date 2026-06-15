import { prisma } from "./prisma";

export type AgentKnownFacts = {
  tenantId?: string;
  tenantName?: string;
  tenantQuery?: string;
  propertyId?: string;
  propertyName?: string;
  propertyQuery?: string;
  unitId?: string;
  unitNumber?: string;
  templateId?: string;
  templateName?: string;
  email?: string;
  phone?: string;
  leaseDuration?: string;
  specialTerms?: string;
  raw?: Record<string, string>;
};

export type AgentConversationStateValue = {
  goal?: string | null;
  status: string;
  facts: AgentKnownFacts;
  pendingQuestion?: string | null;
  pendingTool?: string | null;
  plan?: unknown;
  lastEntityRefs?: unknown;
};

const emptyState: AgentConversationStateValue = {
  status: "idle",
  facts: {}
};

export async function loadAgentState(conversationId: string): Promise<AgentConversationStateValue> {
  const row = await prisma.agentConversationState.findUnique({ where: { conversationId } }).catch(() => null);
  if (!row) return { ...emptyState, facts: {} };
  return {
    goal: row.goal,
    status: row.status || "idle",
    facts: normalizeFacts(row.facts),
    pendingQuestion: row.pendingQuestion,
    pendingTool: row.pendingTool,
    plan: row.plan,
    lastEntityRefs: row.lastEntityRefs
  };
}

export async function saveAgentState(conversationId: string, state: AgentConversationStateValue) {
  const plan = jsonOrUndefined(state.plan);
  const lastEntityRefs = jsonOrUndefined(state.lastEntityRefs);
  return prisma.agentConversationState.upsert({
    where: { conversationId },
    create: {
      conversationId,
      goal: state.goal || null,
      status: state.status || "idle",
      facts: state.facts || {},
      pendingQuestion: state.pendingQuestion || null,
      pendingTool: state.pendingTool || null,
      plan,
      lastEntityRefs
    },
    update: {
      goal: state.goal || null,
      status: state.status || "idle",
      facts: state.facts || {},
      pendingQuestion: state.pendingQuestion || null,
      pendingTool: state.pendingTool || null,
      plan,
      lastEntityRefs
    }
  }).catch(() => null);
}

export async function resetAgentState(conversationId: string) {
  await prisma.agentConversationState.deleteMany({ where: { conversationId } }).catch(() => undefined);
}

export function updateStateFromUserMessage(state: AgentConversationStateValue, message: string): AgentConversationStateValue {
  const facts = { ...(state.facts || {}) };
  const raw = { ...(facts.raw || {}) };
  const text = message.trim();
  const normalized = normalize(text);

  if (/(mietvertrag|vertrag).*(mach|mache|erstelle|erzeug|generier)|(?:mach|mache|erstelle|erzeug|generier).*(mietvertrag|vertrag)/i.test(normalized)) {
    state.goal = "create_contract";
    state.status = state.status === "done" ? "collecting" : state.status || "collecting";
  }

  if (/unbefristet/i.test(text)) facts.leaseDuration = "unbefristet";
  if (/keine weiteren|keine klauseln|ohne.*klauseln/i.test(text)) facts.specialTerms = "keine weiteren Klauseln";

  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  if (email) facts.email = email;

  const phone = text.match(/(?:telefon|tel\.?|phone|handy)\s*[:=]?\s*([+0-9][0-9 /().-]{4,})/i)?.[1];
  if (phone) facts.phone = phone.trim();

  const named = extractLabeledValue(text, ["name", "mieter", "mietername"]);
  if (named) {
    facts.tenantName = named;
    facts.tenantQuery = named;
    raw.tenantName = named;
  }

  const address = extractLabeledValue(text, ["adresse", "objekt", "immobilie"]);
  if (address) {
    facts.propertyQuery = address;
    raw.propertyQuery = address;
  }

  const propertyMention = extractLikelyAddress(text);
  if (propertyMention && !isAffirmation(text)) {
    facts.propertyQuery = propertyMention;
    raw.propertyQuery = propertyMention;
  }

  if (!facts.tenantQuery && looksLikePersonName(text) && !isAffirmation(text)) {
    facts.tenantName = text;
    facts.tenantQuery = text;
    raw.tenantName = text;
  }

  facts.raw = raw;
  return { ...state, facts };
}

export function isAffirmation(message: string) {
  return /^(ja|genau|korrekt|richtig|passt|ok|okay|mach das|weiter|so machen|bestätige|bestaetige|stimmt)[.! ]*$/i.test(message.trim());
}

export function stateForPrompt(state: AgentConversationStateValue) {
  return {
    goal: state.goal || null,
    status: state.status || "idle",
    knownFacts: state.facts || {},
    pendingQuestion: state.pendingQuestion || null,
    pendingTool: state.pendingTool || null,
    plan: state.plan || null,
    lastEntityRefs: state.lastEntityRefs || null
  };
}

export function updateStateFromToolResults(state: AgentConversationStateValue, results: Array<{ name: string; ok: boolean; data?: unknown; needsClarification?: boolean; summary: string }>) {
  const facts = { ...(state.facts || {}) };
  const refs: Record<string, unknown> = {};
  for (const result of results) {
    if (!result.ok) continue;
    const data = result.data as any;
    if (result.name === "search_properties" && Array.isArray(data) && data.length === 1) {
      facts.propertyId = data[0].id;
      facts.propertyName = data[0].name;
      facts.propertyQuery = data[0].name;
      refs.property = data[0];
    }
    if (result.name === "get_property" && data?.id) {
      facts.propertyId = data.id;
      facts.propertyName = data.name;
      facts.propertyQuery = data.name;
      refs.property = { id: data.id, name: data.name, href: `/properties/${data.id}` };
    }
    if (result.name === "search_tenants" && Array.isArray(data) && data.length === 1) {
      facts.tenantId = data[0].id;
      facts.tenantName = data[0].name;
      facts.tenantQuery = data[0].name;
      if (data[0].propertyName && !facts.propertyQuery) facts.propertyQuery = data[0].propertyName;
      refs.tenant = data[0];
    }
    if (result.name === "get_tenant" && data?.id) {
      facts.tenantId = data.id;
      facts.tenantName = `${data.firstName || ""} ${data.lastName || ""}`.trim() || data.email || "Mieter";
      facts.tenantQuery = facts.tenantName;
      if (data.unitId) facts.unitId = data.unitId;
      if (data.unit?.unitNumber) facts.unitNumber = data.unit.unitNumber;
      if (data.unit?.propertyId) facts.propertyId = data.unit.propertyId;
      if (data.unit?.property?.name) facts.propertyName = data.unit.property.name;
      refs.tenant = { id: data.id, name: facts.tenantName, href: `/users?tenantId=${data.id}` };
    }
    if (result.name === "search_templates" && Array.isArray(data) && data.length === 1) {
      facts.templateId = data[0].id;
      facts.templateName = data[0].name;
      refs.template = data[0];
    }
    if (result.name === "create_contract" && data && (data as any).contractId) {
      state.goal = "create_contract";
      state.status = "done";
      refs.contract = data;
    }
  }
  if (results.some((result) => result.needsClarification)) {
    state.status = "waiting_for_user";
    state.pendingQuestion = results.find((result) => result.needsClarification)?.summary || null;
  } else if (state.status !== "done") {
    state.status = state.goal ? "collecting" : "idle";
    state.pendingQuestion = null;
  }
  return { ...state, facts, lastEntityRefs: { ...(state.lastEntityRefs as object || {}), ...refs } };
}

function normalizeFacts(value: unknown): AgentKnownFacts {
  if (!value || typeof value !== "object") return {};
  return value as AgentKnownFacts;
}

function extractLabeledValue(text: string, labels: string[]) {
  for (const label of labels) {
    const match = text.match(new RegExp(`${label}\\s*[:=]\\s*([^\\n;]+)`, "i"));
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function extractLikelyAddress(text: string) {
  const match = text.match(/\b([A-ZÄÖÜ][\wäöüÄÖÜß.-]*(?:str\.?|straße|strasse|gasse|weg|platz|allee)\s*\d*[a-z]?(?:,\s*[A-ZÄÖÜ][\wäöüÄÖÜß.-]+)?)\b/i);
  if (match?.[1]) return match[1].trim();
  const known = text.match(/\b(Beispielweg\.?\s*74|Musterstraße\s*14|Sportstr\.?\s*32|Demostr\.?\s*2a)\b/i);
  return known?.[1]?.trim() || "";
}

function looksLikePersonName(text: string) {
  const cleaned = text.trim();
  if (cleaned.length > 80 || /[?:/\\]/.test(cleaned)) return false;
  const parts = cleaned.split(/\s+/).filter(Boolean);
  return parts.length >= 2 && parts.length <= 4 && parts.every((part) => /^[A-ZÄÖÜ][a-zäöüß-]+$/.test(part));
}

function normalize(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss");
}

function jsonOrUndefined(value: unknown) {
  return value === null || value === undefined ? undefined : value as never;
}
