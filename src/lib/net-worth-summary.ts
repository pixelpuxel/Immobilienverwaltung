import { Role } from "@prisma/client";
import { loadBankingAccounts } from "./banking-integration";
import { mappedLoanValue, serializeBankingAccount, signedAssetValue } from "./net-worth";
import { portalWhere } from "./portal-instance";
import { prisma } from "./prisma";

type NetWorthUser = {
  id: string;
  role: Role;
  portalInstanceId: string | null;
  platformAdmin?: boolean;
};

export async function buildNetWorthSummary(user: NetWorthUser) {
  let bankingError: string | null = null;
  const accounts = await loadBankingAccounts(user.portalInstanceId)
    .then((items) => items.map(serializeBankingAccount))
    .catch((error) => {
      bankingError = error instanceof Error ? error.message : "Bankkonten konnten nicht geladen werden.";
      return [];
    });
  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const [properties, assets] = await Promise.all([
    prisma.property.findMany({
      where: portalWhere(user),
      include: { loanAccountMappings: true },
      orderBy: { name: "asc" }
    }),
    prisma.netWorthAsset.findMany({
      where: { portalInstanceId: user.portalInstanceId ?? null, active: true },
      orderBy: { name: "asc" }
    })
  ]);
  const propertyItems = properties.map((property) => {
    const mappedLoan = mappedLoanValue(property.loanAccountMappings, accountMap);
    const propertyValue = Number(property.expectedPurchasePrice || 0);
    const loanValue = mappedLoan || Number(property.outstandingLoan || 0);
    return {
      id: property.id,
      name: property.name,
      address: property.address,
      propertyValue,
      loanValue,
      netValue: propertyValue - loanValue,
      loanAccountMappings: property.loanAccountMappings.map((mapping) => ({
        id: mapping.id,
        bankingAccountId: mapping.bankingAccountId,
        label: mapping.label,
        lastBalance: Number(mapping.lastBalance || 0),
        liveBalance: accountMap.get(mapping.bankingAccountId)?.balance ?? null
      }))
    };
  });
  const assetItems = assets.map((asset) => ({
    id: asset.id,
    name: asset.name,
    type: asset.type,
    manualValue: Number(asset.manualValue || 0),
    bankingAccountId: asset.bankingAccountId,
    bankingAccountLabel: asset.bankingAccountLabel,
    lastSyncedValue: Number(asset.lastSyncedValue || 0),
    signedValue: signedAssetValue(asset, accountMap)
  }));
  const propertyValue = propertyItems.reduce((sum, item) => sum + item.propertyValue, 0);
  const loanValue = propertyItems.reduce((sum, item) => sum + item.loanValue, 0);
  const otherNetWorth = assetItems.reduce((sum, item) => sum + item.signedValue, 0);
  return {
    bankingError,
    accounts,
    summary: {
      propertyValue,
      loanValue,
      realEstateNetValue: propertyValue - loanValue,
      otherNetWorth,
      totalNetWorth: propertyValue - loanValue + otherNetWorth
    },
    properties: propertyItems,
    assets: assetItems
  };
}
