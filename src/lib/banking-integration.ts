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
  classification_label?: string;
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
  generated_at?: string;
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
    is_current?: boolean;
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

export class BankingApiError extends Error {
  constructor(readonly status: number, message: string, readonly details?: unknown) {
    super(message);
  }
}

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
  return {
    ...data,
    allocable_costs: normalizeLineGroup(data.allocable_costs),
    service_charge_prepayments: normalizeLineGroup(data.service_charge_prepayments),
    service_charge_settlements: normalizeLineGroup(data.service_charge_settlements),
    cold_rent: normalizeLineGroup(data.cold_rent)
  };
}

function normalizeLineGroup(group: { total: string; items: ServiceChargeLine[] }) {
  return {
    ...group,
    items: (group.items || []).map((item) => ({
      ...item,
      pending: Boolean(Number(item.pending as unknown) || item.pending === true)
    }))
  };
}

export async function loadBankingAccounts(portalInstanceId: string | null) {
  const config = await getBankingIntegration(portalInstanceId);
  if (!config?.apiTokenEncrypted) throw new Error("Banking-API-Token fehlt in den Einstellungen.");
  const url = `${config.baseUrl}/api/v1/accounts`;
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
    const data = await response.json() as { items?: BankingAccount[] } | BankingAccount[];
    await prisma.bankingIntegrationConfig.update({
      where: { id: config.id },
      data: { lastSuccessfulAt: new Date(), lastError: null }
    });
    return Array.isArray(data) ? data : data.items || [];
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Banking-Fehler.";
    await prisma.bankingIntegrationConfig.update({
      where: { id: config.id },
      data: { lastError: message.slice(0, 1000) }
    });
    throw error;
  }
}

export async function loadBankingTransactionDetails(input: {
  portalInstanceId: string | null;
  transactionId: number;
}) {
  const config = await getBankingIntegration(input.portalInstanceId);
  if (!config?.apiTokenEncrypted) throw new Error("Banking-API-Token fehlt in den Einstellungen.");
  const url = `${config.baseUrl}/api/v1/transactions/${encodeURIComponent(String(input.transactionId))}/details`;
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${decryptSecret(config.apiTokenEncrypted)}`,
        Accept: "application/json"
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new BankingApiError(response.status, String(body.detail || body.error || `Banking antwortet mit HTTP ${response.status}.`), body);
    }
    await prisma.bankingIntegrationConfig.update({
      where: { id: config.id },
      data: { lastSuccessfulAt: new Date(), lastError: null }
    });
    return body;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Banking-Fehler.";
    await prisma.bankingIntegrationConfig.update({
      where: { id: config.id },
      data: { lastError: message.slice(0, 1000) }
    });
    throw error;
  }
}

export function bankingAccountBalance(account: Pick<BankingAccount, "balance_amount">) {
  const value = Number(account.balance_amount ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function bankingAccountDisplayName(account: BankingAccount) {
  return [
    account.bank_name,
    account.name || account.subaccount || account.account_number,
    maskedIban(account.iban || "")
  ].filter(Boolean).join(" · ");
}

export function maskedIban(iban: string) {
  const normalized = iban.replace(/\s+/g, "");
  if (!normalized) return "";
  if (normalized.length <= 8) return normalized;
  return `${normalized.slice(0, 4)}…${normalized.slice(-4)}`;
}

export function redactBankingIntegration(config: Awaited<ReturnType<typeof getBankingIntegration>>) {
  return {
    configured: Boolean(config?.apiTokenEncrypted),
    baseUrl: config?.baseUrl || "https://banking.schreiber.info",
    lastSuccessfulAt: config?.lastSuccessfulAt?.toISOString() || null,
    lastError: config?.lastError || null
  };
}
