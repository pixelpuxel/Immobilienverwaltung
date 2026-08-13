import { decryptSecret, encryptSecret } from "./secrets";
import { prisma } from "./prisma";

export type ServiceChargeLine = {
  id: number;
  transaction_id: number;
  booking_date: string;
  value_date: string;
  amount: string;
  transaction_amount: string;
  currency: string;
  bank_name: string;
  account_name: string;
  account_iban: string;
  account_bic: string;
  account_number: string;
  applicant_name: string;
  applicant_iban: string;
  applicant_bic: string;
  purpose: string;
  memo: string;
  transaction_code: string;
  bank_reference: string;
  customer_reference: string;
  tx_note: string;
  tx_flag: string;
  pending: boolean;
  bank_imported: boolean;
  source_type: string;
  source_reference: string;
  imported_at: string;
  category_path: string;
  contractual_cold_rent: string;
  contractual_garage_rent: string;
  property_external_id: string;
  unit_external_id: string;
  tenant_external_id: string;
  accounting_role: string;
};

export type ServiceChargeData = {
  property: { external_id: string; name: string; address: string };
  year: number;
  units: Array<{
    external_id: string;
    name: string;
    floor: string;
    living_area: string;
    is_shared_housing: boolean;
  }>;
  tenancies: Array<{
    external_id: string;
    unit_external_id: string;
    display_name: string;
    lease_start_date: string;
    move_in_date: string;
    move_out_date: string;
    rent_amount: string;
    garage_rent: string;
    service_charges: string;
    stepped_rent: unknown;
    actual_service_charge_prepayments: string;
  }>;
  allocable_costs: { total: string; items: ServiceChargeLine[] };
  service_charge_prepayments: { total: string; items: ServiceChargeLine[] };
  service_charge_settlements: { total: string; items: ServiceChargeLine[] };
  cold_rent: { total: string; items: ServiceChargeLine[] };
  allocation: {
    owner: string;
    note: string;
  };
};

export type BankingTransactionDetails = Record<string, unknown> & {
  transactionId?: number | string;
  transaction_id?: number | string;
  amount?: string | number;
  currency?: string;
  splits?: unknown[];
};

export type BankingAccount = {
  id: number;
  bank_connection_id?: number | null;
  iban?: string | null;
  bic?: string | null;
  account_number?: string | null;
  subaccount?: string | null;
  name?: string | null;
  balance_amount?: string | number | null;
  balance_currency?: string | null;
  balance_date?: string | null;
  balance_at?: string | null;
  bank_name?: string | null;
  access_type?: string | null;
  tx_count?: number | null;
  last_tx_date?: string | null;
};

export async function getBankingIntegration(portalInstanceId: string | null) {
  return prisma.bankingIntegrationConfig.findFirst({
    where: { portalInstanceId: portalInstanceId ?? null }
  });
}

export async function saveBankingIntegration(input: {
  portalInstanceId: string | null;
  baseUrl: string;
  apiToken?: string;
}) {
  const current = await getBankingIntegration(input.portalInstanceId);
  const data = {
    baseUrl: input.baseUrl.replace(/\/+$/, ""),
    apiTokenEncrypted: input.apiToken
      ? encryptSecret(input.apiToken)
      : current?.apiTokenEncrypted || null
  };
  if (current) {
    return prisma.bankingIntegrationConfig.update({ where: { id: current.id }, data });
  }
  return prisma.bankingIntegrationConfig.create({
    data: { portalInstanceId: input.portalInstanceId, ...data }
  });
}

export async function loadServiceChargeData(input: {
  portalInstanceId: string | null;
  propertyId: string;
  year: number;
  unitId?: string;
  tenantId?: string;
}) {
  const config = await getBankingIntegration(input.portalInstanceId);
  if (!config?.apiTokenEncrypted) throw new Error("Banking-API-Token fehlt in den Einstellungen.");
  const query = new URLSearchParams();
  if (input.unitId) query.set("unit_external_id", input.unitId);
  if (input.tenantId) query.set("tenant_external_id", input.tenantId);
  const suffix = query.size ? `?${query.toString()}` : "";
  const url = `${config.baseUrl}/api/v1/service-charge-data/${encodeURIComponent(input.propertyId)}/${input.year}${suffix}`;
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${decryptSecret(config.apiTokenEncrypted)}`,
        Accept: "application/json"
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000)
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(String(body.detail || body.error || `Banking antwortet mit HTTP ${response.status}.`));
    }
    const data = normalizeServiceChargeData(await response.json() as ServiceChargeData);
    await prisma.bankingIntegrationConfig.update({
      where: { id: config.id },
      data: { lastSuccessfulAt: new Date(), lastError: null }
    });
    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Banking-Fehler.";
    await prisma.bankingIntegrationConfig.update({
      where: { id: config.id },
      data: { lastError: message.slice(0, 1000) }
    });
    throw error;
  }
}

export function normalizeServiceChargeData(data: ServiceChargeData): ServiceChargeData {
  const normalizeBucket = (bucket: ServiceChargeData["allocable_costs"]) => ({
    ...bucket,
    items: bucket.items.map((item) => ({
      ...item,
      pending: normalizeBoolean(item.pending)
    }))
  });
  return {
    ...data,
    allocable_costs: normalizeBucket(data.allocable_costs),
    service_charge_prepayments: normalizeBucket(data.service_charge_prepayments),
    service_charge_settlements: normalizeBucket(data.service_charge_settlements),
    cold_rent: normalizeBucket(data.cold_rent)
  };
}

function normalizeBoolean(value: unknown) {
  return value === true || value === 1 || String(value).toLowerCase() === "true";
}

export class BankingApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details: unknown
  ) {
    super(message);
  }
}

export async function bankingApiJson<T = unknown>(input: {
  portalInstanceId: string | null;
  path: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  timeoutMs?: number;
}) {
  const config = await getBankingIntegration(input.portalInstanceId);
  if (!config?.apiTokenEncrypted) throw new Error("Banking-API-Token fehlt in den Einstellungen.");
  const url = new URL(input.path.startsWith("/") ? input.path : `/${input.path}`, config.baseUrl.replace(/\/+$/, ""));
  for (const [key, value] of Object.entries(input.query || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${decryptSecret(config.apiTokenEncrypted)}`,
        Accept: "application/json"
      },
      cache: "no-store",
      signal: AbortSignal.timeout(input.timeoutMs ?? 20_000)
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const message = body && typeof body === "object"
        ? String((body as { detail?: unknown; error?: unknown }).detail || (body as { detail?: unknown; error?: unknown }).error || `Banking antwortet mit HTTP ${response.status}.`)
        : `Banking antwortet mit HTTP ${response.status}.`;
      throw new BankingApiError(response.status, message, body);
    }
    await prisma.bankingIntegrationConfig.update({
      where: { id: config.id },
      data: { lastSuccessfulAt: new Date(), lastError: null }
    });
    return body as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Banking-Fehler.";
    await prisma.bankingIntegrationConfig.update({
      where: { id: config.id },
      data: { lastError: message.slice(0, 1000) }
    }).catch(() => undefined);
    throw error;
  }
}

export async function loadBankingAccounts(portalInstanceId: string | null) {
  const data = await bankingApiJson<{ items?: BankingAccount[] } | BankingAccount[]>({
    portalInstanceId,
    path: "/api/v1/accounts"
  });
  return Array.isArray(data) ? data : data.items || [];
}

export async function loadBankingTransactionDetails(input: {
  portalInstanceId: string | null;
  transactionId: number;
}) {
  const transactionId = input.transactionId;
  try {
    const direct = await bankingApiJson<BankingTransactionDetails>({
      portalInstanceId: input.portalInstanceId,
      path: `/api/v1/transactions/${transactionId}/details`
    });
    return normalizeBankingTransactionDetails(transactionId, direct, { sourceEndpoint: "details" });
  } catch (error) {
    if (!(error instanceof BankingApiError) || ![404, 405, 501].includes(error.status)) throw error;
  }

  const transaction = await bankingApiJson<Record<string, unknown>>({
    portalInstanceId: input.portalInstanceId,
    path: `/api/v1/transactions/${transactionId}`
  });
  const [splits, history, comments] = await Promise.all([
    optionalBankingApiJson(input.portalInstanceId, `/api/v1/transactions/${transactionId}/splits`),
    optionalBankingApiJson(input.portalInstanceId, `/api/v1/transactions/${transactionId}/history`),
    optionalBankingApiJson(input.portalInstanceId, `/api/v1/transactions/${transactionId}/comments`)
  ]);

  return normalizeBankingTransactionDetails(transactionId, {
    ...transaction,
    splits: itemsFrom(splits),
    history: itemsFrom(history),
    userComments: itemsFrom(comments).length ? itemsFrom(comments) : transaction.comments || [],
    linkedDocuments: transaction.documents || []
  }, { sourceEndpoint: "fallback" });
}

async function optionalBankingApiJson(portalInstanceId: string | null, path: string) {
  try {
    return await bankingApiJson({ portalInstanceId, path });
  } catch {
    return null;
  }
}

function normalizeBankingTransactionDetails(transactionId: number, input: Record<string, unknown>, meta: Record<string, unknown>) {
  const rawSplits = Array.isArray(input.splits) ? input.splits : itemsFrom(input);
  const splits = rawSplits.map((split) => normalizeSplit(split));
  const firstSplit = splits[0] as Record<string, unknown> | undefined;
  const categoryPath = stringValue(input.category_path) || stringValue(firstSplit?.categoryPath) || stringValue(firstSplit?.category_path);
  const [category, ...subcategoryParts] = splitCategoryPath(categoryPath);
  return {
    transactionId: numberValue(input.transactionId ?? input.transaction_id) ?? transactionId,
    transaction_id: numberValue(input.transaction_id ?? input.transactionId) ?? transactionId,
    bookingDate: stringValue(input.bookingDate ?? input.booking_date),
    valueDate: stringValue(input.valueDate ?? input.value_date),
    amount: input.amount ?? input.transaction_amount ?? null,
    currency: stringValue(input.currency) || "EUR",
    purpose: stringValue(input.purpose ?? input.memo ?? input.remittance_information),
    counterparty: stringValue(input.counterparty ?? input.applicant_name ?? input.counterparty_name),
    account: input.account ?? {
      name: input.account_name ?? null,
      iban: input.account_iban ?? null,
      bic: input.account_bic ?? null,
      number: input.account_number ?? null
    },
    category: input.category ?? category ?? null,
    subcategory: input.subcategory ?? (subcategoryParts.length ? subcategoryParts.join(" / ") : null),
    property: input.property ?? uniqueEntity(splits, "property"),
    unit: input.unit ?? uniqueEntity(splits, "unit"),
    tenant: input.tenant ?? uniqueEntity(splits, "tenant"),
    contract: input.contract ?? uniqueEntity(splits, "contract"),
    notes: input.notes ?? { note: input.tx_note ?? null, flag: input.tx_flag ?? null, memo: input.memo ?? null },
    ocrResults: input.ocrResults ?? input.ocr_results ?? collectDocumentField(input, "ocr"),
    linkedDocuments: input.linkedDocuments ?? input.linked_documents ?? input.documents ?? [],
    history: input.history ?? [],
    aiAnalyses: input.aiAnalyses ?? input.ai_analyses ?? input.classification_suggestions ?? collectAiFields(input),
    userComments: input.userComments ?? input.user_comments ?? input.comments ?? [],
    splits,
    raw: input,
    meta
  };
}

function normalizeSplit(split: unknown) {
  const value = split && typeof split === "object" ? split as Record<string, unknown> : {};
  const categoryPath = stringValue(value.categoryPath ?? value.category_path);
  const [category, ...subcategoryParts] = splitCategoryPath(categoryPath);
  return {
    ...value,
    id: value.id ?? null,
    type: value.type ?? value.accounting_role ?? value.role ?? null,
    label: value.label ?? value.memo ?? categoryPath ?? value.accounting_role ?? null,
    amount: value.amount ?? null,
    currency: value.currency ?? "EUR",
    category: value.category ?? category ?? null,
    subcategory: value.subcategory ?? (subcategoryParts.length ? subcategoryParts.join(" / ") : null),
    categoryPath: categoryPath || null,
    property: value.property ?? entityFromExternal(value.property_external_id, value.property_name),
    unit: value.unit ?? entityFromExternal(value.unit_external_id, value.unit_name),
    tenant: value.tenant ?? entityFromExternal(value.tenant_external_id, value.tenant_name),
    contract: value.contract ?? entityFromExternal(value.contract_external_id, value.contract_name),
    notes: value.notes ?? value.note ?? value.memo ?? null,
    tags: value.tags ?? [],
    vat: value.vat ?? {
      code: value.vat_code ?? null,
      name: value.vat_name ?? null,
      direction: value.vat_direction ?? null,
      treatment: value.vat_treatment ?? null
    }
  };
}

function entityFromExternal(id: unknown, name: unknown) {
  if (!id && !name) return null;
  return { id: id ?? null, name: name ?? null };
}

function uniqueEntity(splits: unknown[], key: "property" | "unit" | "tenant" | "contract") {
  const entities = splits
    .map((split) => split && typeof split === "object" ? (split as Record<string, unknown>)[key] : null)
    .filter((entity) => entity && typeof entity === "object") as Array<Record<string, unknown>>;
  const byId = new Map<string, Record<string, unknown>>();
  for (const entity of entities) {
    const id = String(entity.id ?? entity.externalId ?? entity.name ?? JSON.stringify(entity));
    byId.set(id, entity);
  }
  if (byId.size === 0) return null;
  if (byId.size === 1) return Array.from(byId.values())[0];
  return Array.from(byId.values());
}

function itemsFrom(value: unknown) {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value;
  const object = value as { items?: unknown };
  return Array.isArray(object.items) ? object.items : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function splitCategoryPath(value: string) {
  return value ? value.split(/[>:]/).map((part) => part.trim()).filter(Boolean) : [];
}

function numberValue(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function collectDocumentField(input: Record<string, unknown>, field: string) {
  const documents = input.documents ?? input.linkedDocuments ?? input.linked_documents;
  if (!Array.isArray(documents)) return [];
  return documents
    .map((document) => document && typeof document === "object" ? document as Record<string, unknown> : null)
    .filter((document): document is Record<string, unknown> => Boolean(document))
    .map((document) => ({
      documentId: document.id ?? document.documentId ?? null,
      filename: document.filename ?? document.original_name ?? null,
      text: document[`${field}_text`] ?? document.ocrText ?? null,
      status: document[`${field}_status`] ?? document.ocrStatus ?? null
    }));
}

function collectAiFields(input: Record<string, unknown>) {
  const keys = ["classification", "classification_suggestion", "classification_source", "classification_confidence", "ai_summary", "ai_tags"];
  return Object.fromEntries(keys.filter((key) => input[key] !== undefined).map((key) => [key, input[key]]));
}


export function redactBankingIntegration(config: Awaited<ReturnType<typeof getBankingIntegration>>) {
  return {
    configured: Boolean(config?.apiTokenEncrypted),
    baseUrl: config?.baseUrl || "https://banking.schreiber.info",
    lastSuccessfulAt: config?.lastSuccessfulAt?.toISOString() || null,
    lastError: config?.lastError || null
  };
}
