import { AuditAction, Role } from "@prisma/client";
import { auditLog } from "./audit";
import { loadBankingAccounts } from "./banking-integration";
import { serializeBankingAccount } from "./net-worth";
import { portalWhere } from "./portal-instance";
import { prisma } from "./prisma";

type SyncUser = {
  id: string;
  role: Role;
  portalInstanceId: string | null;
};

export async function syncNetWorthFromBanking(user: SyncUser) {
  const accountMap = new Map((await loadBankingAccounts(user.portalInstanceId)).map(serializeBankingAccount).map((account) => [account.id, account]));
  const loanMappings = await prisma.propertyLoanAccountMapping.findMany({
    where: { property: portalWhere(user) },
    include: { property: { select: { id: true, name: true } } }
  });
  const assets = await prisma.netWorthAsset.findMany({
    where: { portalInstanceId: user.portalInstanceId ?? null, active: true, bankingAccountId: { not: null } }
  });
  const now = new Date();
  const propertyUpdates = new Map<string, number>();
  for (const mapping of loanMappings) {
    const account = accountMap.get(mapping.bankingAccountId);
    if (!account) continue;
    await prisma.propertyLoanAccountMapping.update({
      where: { id: mapping.id },
      data: { lastBalance: account.balance, lastBalanceAt: now }
    });
    propertyUpdates.set(mapping.propertyId, (propertyUpdates.get(mapping.propertyId) || 0) + Math.abs(account.balance));
  }
  const properties = [];
  for (const [propertyId, loan] of propertyUpdates) {
    properties.push(await prisma.property.update({
      where: { id: propertyId },
      data: { outstandingLoan: loan },
      select: { id: true, name: true, outstandingLoan: true }
    }));
  }
  const syncedAssets = [];
  for (const asset of assets) {
    const account = asset.bankingAccountId ? accountMap.get(asset.bankingAccountId) : null;
    if (!account) continue;
    syncedAssets.push(await prisma.netWorthAsset.update({
      where: { id: asset.id },
      data: {
        lastSyncedValue: Math.abs(account.balance),
        lastSyncedAt: now,
        bankingAccountLabel: asset.bankingAccountLabel || account.label
      },
      select: { id: true, name: true, type: true, lastSyncedValue: true, lastSyncedAt: true }
    }));
  }
  await auditLog({
    userId: user.id,
    action: AuditAction.PROPERTY_CHANGED,
    entity: "NetWorth",
    entityId: user.portalInstanceId || user.id,
    detail: { operation: "bankingSync", properties: properties.length, assets: syncedAssets.length }
  });
  return { ok: true, properties, assets: syncedAssets };
}
