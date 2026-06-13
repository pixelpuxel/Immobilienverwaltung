import crypto from "crypto";
import { Role, type AiProviderConfig } from "@prisma/client";
import { readPrivateFile } from "./files";
import { env } from "./env";
import { brokerPropertyIds, tenantUnitId } from "./permissions";
import { type ScopedUser } from "./portal-instance";
import { prisma } from "./prisma";
import { decryptSecret, encryptSecret } from "./secrets";

const COLLECTION = "immobilienportal_documents";
const AGENT_MEMORY_COLLECTION = "immobilienportal_agent_memory";
const VECTOR_SIZE = 1536;

export type AiProviderName = "openai" | "gemini";

export async function getAiConfig(portalInstanceId: string | null) {
  return prisma.aiProviderConfig.findFirst({ where: { portalInstanceId } });
}

export async function saveAiConfig(input: {
  portalInstanceId: string | null;
  provider: AiProviderName;
  apiKey?: string;
  embeddingModel?: string;
  transcriptionModel?: string;
}) {
  const existing = await getAiConfig(input.portalInstanceId);
  const defaults = providerDefaults(input.provider);
  const data = {
    provider: input.provider,
    embeddingModel: input.embeddingModel || defaults.embeddingModel,
    transcriptionModel: input.transcriptionModel || defaults.transcriptionModel,
    ...(input.apiKey ? { apiKeyEncrypted: encryptSecret(input.apiKey) } : {})
  };
  return existing
    ? prisma.aiProviderConfig.update({ where: { id: existing.id }, data })
    : prisma.aiProviderConfig.create({ data: { portalInstanceId: input.portalInstanceId, ...data } });
}

export function providerDefaults(provider: AiProviderName) {
  if (provider === "gemini") {
    return { embeddingModel: "text-embedding-004", transcriptionModel: "gemini-1.5-flash" };
  }
  return { embeddingModel: "text-embedding-3-small", transcriptionModel: "gpt-4o-mini-transcribe" };
}

export async function indexAllDocuments(portalInstanceId: string | null) {
  await ensureCollection();
  const documents = await prisma.document.findMany({
    where: { portalInstanceId },
    include: { property: true, unit: { include: { property: true } }, category: true },
    orderBy: { updatedAt: "desc" }
  });
  let indexed = 0;
  for (const document of documents) {
    await indexDocument(document.id).catch((error) => console.error("Document index failed", document.id, error));
    indexed += 1;
  }
  return { total: documents.length, indexed };
}

export async function indexDocument(documentId: string) {
  await ensureCollection();
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: { property: true, unit: { include: { property: true } }, category: true }
  });
  if (!document) return null;
  const config = await getAiConfig(document.portalInstanceId);
  const text = await documentIndexText(document);
  const vector = await embedText(config, text);
  const point = {
    id: pointId(document.id),
    vector,
    payload: {
      documentId: document.id,
      portalInstanceId: document.portalInstanceId || "",
      title: document.title,
      filename: document.filename,
      summary: document.summary || "",
      tags: document.tags,
      mimeType: document.mimeType,
      propertyId: document.propertyId || "",
      propertyName: document.property?.name || document.unit?.property?.name || "",
      unitId: document.unitId || "",
      unitNumber: document.unit?.unitNumber || "",
      category: document.category ? `${document.category.group} / ${document.category.name}` : "",
      text: text.slice(0, 4000),
      updatedAt: document.updatedAt.toISOString()
    }
  };
  await qdrant("PUT", `/collections/${COLLECTION}/points?wait=true`, { points: [point] });
  return point;
}

export async function semanticDocumentSearch(user: ScopedUser, query: string, limit = 10) {
  const q = query.trim();
  if (q.length < 2) return [];
  await ensureCollection();
  const config = await getAiConfig(user.portalInstanceId);
  const vector = await embedText(config, q);
  const filters = await documentAccessFilter(user);
  const body = {
    vector,
    limit,
    with_payload: true,
    score_threshold: 0.18,
    filter: filters
  };
  const result = await qdrant<{ result?: Array<{ score: number; payload?: Record<string, unknown> }> }>("POST", `/collections/${COLLECTION}/points/search`, body);
  return (result.result || []).map((item) => ({
    type: "Dokument" as const,
    title: String(item.payload?.title || item.payload?.filename || "Dokument"),
    description: [
      item.payload?.summary,
      item.payload?.propertyName,
      item.payload?.unitNumber ? `Einheit ${item.payload.unitNumber}` : null,
      item.payload?.category,
      `Semantischer Treffer ${(item.score * 100).toFixed(0)} %`
    ].filter(Boolean).join(" · "),
    href: `/api/documents/${item.payload?.documentId}/preview`,
    badge: "semantisch"
  }));
}

export async function transcribeAudio(config: AiProviderConfig | null, bytes: Buffer, filename = "telegram-audio.ogg", mimeType = "audio/ogg") {
  if (!config?.apiKeyEncrypted) throw new Error("Bitte zuerst einen AI-Provider und API-Key in den Einstellungen hinterlegen.");
  const apiKey = decryptSecret(config.apiKeyEncrypted);
  if (config.provider === "gemini") return transcribeGemini(apiKey, config.transcriptionModel, bytes, mimeType);
  return transcribeOpenAi(apiKey, config.transcriptionModel, bytes, filename, mimeType);
}

async function embedText(config: AiProviderConfig | null, text: string) {
  if (!config?.apiKeyEncrypted) return deterministicVector(text);
  try {
    const apiKey = decryptSecret(config.apiKeyEncrypted);
    if (config.provider === "gemini") {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.embeddingModel}:embedContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: { parts: [{ text }] } })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message || "Gemini Embedding fehlgeschlagen.");
      return normalizeVector(body.embedding?.values || []);
    }
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: config.embeddingModel, input: text.slice(0, 24000) })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error?.message || "OpenAI Embedding fehlgeschlagen.");
    return normalizeVector(body.data?.[0]?.embedding || []);
  } catch (error) {
    console.error("Embedding provider failed, using deterministic fallback", error);
    return deterministicVector(text);
  }
}

export async function createEmbedding(portalInstanceId: string | null, text: string) {
  return embedText(await getAiConfig(portalInstanceId), text);
}

export async function ensureVectorCollection(collection = COLLECTION) {
  const exists = await fetch(`${env.qdrantUrl}/collections/${collection}`).then((response) => response.ok).catch(() => false);
  if (exists) return;
  await qdrant("PUT", `/collections/${collection}`, {
    vectors: { size: VECTOR_SIZE, distance: "Cosine" }
  });
}

export async function qdrantRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  return qdrant<T>(method, path, body);
}

export function vectorPointId(id: string) {
  return pointId(id);
}

export { AGENT_MEMORY_COLLECTION };

async function transcribeOpenAi(apiKey: string, model: string, bytes: Buffer, filename: string, mimeType: string) {
  const form = new FormData();
  form.set("model", model);
  form.set("file", new Blob([new Uint8Array(bytes)], { type: mimeType }), filename);
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || "Transkription fehlgeschlagen.");
  return String(body.text || "").trim();
}

async function transcribeGemini(apiKey: string, model: string, bytes: Buffer, mimeType: string) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: "Transkribiere diese Sprachnachricht auf Deutsch. Gib nur den gesprochenen Text aus." },
          { inlineData: { mimeType, data: bytes.toString("base64") } }
        ]
      }]
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || "Gemini Transkription fehlgeschlagen.");
  return String(body.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join(" ") || "").trim();
}

async function documentIndexText(document: {
  title: string;
  filename: string;
  mimeType: string;
  storagePath: string;
  summary: string | null;
  tags: string[];
  property?: { name: string; address: string; rentalStatus: string | null; objectType: string | null } | null;
  unit?: { unitNumber: string; floor: string | null; property?: { name: string; address: string } | null } | null;
  category?: { group: string; name: string; description: string | null } | null;
}) {
  const parts = [
    document.title,
    document.filename,
    document.summary,
    document.tags.join(", "),
    document.property ? `${document.property.name} ${document.property.address} ${document.property.rentalStatus || ""} ${document.property.objectType || ""}` : "",
    document.unit ? `${document.unit.property?.name || ""} ${document.unit.property?.address || ""} Einheit ${document.unit.unitNumber} ${document.unit.floor || ""}` : "",
    document.category ? `${document.category.group} ${document.category.name} ${document.category.description || ""}` : ""
  ];
  if (document.mimeType.startsWith("text/") || document.filename.toLowerCase().endsWith(".txt")) {
    const content = await readPrivateFile(document.storagePath).then((buffer) => buffer.toString("utf8")).catch(() => "");
    parts.push(content.slice(0, 20000));
  }
  return parts.filter(Boolean).join("\n").slice(0, 30000);
}

async function documentAccessFilter(user: ScopedUser) {
  const must: unknown[] = [{ key: "portalInstanceId", match: { value: user.portalInstanceId || "" } }];
  if (user.role === Role.ADMIN) return { must };
  if (user.role === Role.BROKER) {
    const propertyIds = await brokerPropertyIds(user.id);
    must.push({ key: "propertyId", match: { any: propertyIds } });
    return { must };
  }
  const unitId = await tenantUnitId(user.id);
  must.push({ key: "unitId", match: { value: unitId || "" } });
  return { must };
}

async function ensureCollection() {
  await ensureVectorCollection(COLLECTION);
}

async function qdrant<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${env.qdrantUrl}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.status?.error || data.message || "Qdrant Anfrage fehlgeschlagen.");
  return data as T;
}

function pointId(id: string) {
  const hash = crypto.createHash("sha256").update(id).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

function deterministicVector(text: string) {
  const vector = new Array(VECTOR_SIZE).fill(0);
  const terms = text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((term) => term.length > 1);
  for (const term of terms) {
    const hash = crypto.createHash("sha256").update(term).digest();
    const index = hash.readUInt32BE(0) % VECTOR_SIZE;
    vector[index] += 1;
  }
  return normalizeVector(vector);
}

function normalizeVector(input: number[]) {
  const vector = new Array(VECTOR_SIZE).fill(0);
  for (let index = 0; index < Math.min(VECTOR_SIZE, input.length); index += 1) vector[index] = Number(input[index]) || 0;
  const length = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / length);
}
