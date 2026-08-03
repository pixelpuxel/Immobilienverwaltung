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

export function redactBankingIntegration(config: Awaited<ReturnType<typeof getBankingIntegration>>) {
  return {
    configured: Boolean(config?.apiTokenEncrypted),
    baseUrl: config?.baseUrl || "https://banking.schreiber.info",
    lastSuccessfulAt: config?.lastSuccessfulAt?.toISOString() || null,
    lastError: config?.lastError || null
  };
}
