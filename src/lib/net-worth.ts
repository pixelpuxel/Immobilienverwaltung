import { NetWorthAssetType, type NetWorthAsset, type PropertyLoanAccountMapping } from "@prisma/client";
import {
  bankingAccountBalance,
  bankingAccountDisplayName,
  type BankingAccount
} from "./banking-integration";

export type SerializedBankingAccount = {
  id: number;
  label: string;
  bankName: string | null;
  name: string | null;
  iban: string | null;
  balance: number;
  currency: string;
  balanceDate: string | null;
};

export function serializeBankingAccount(account: BankingAccount): SerializedBankingAccount {
  return {
    id: account.id,
    label: bankingAccountDisplayName(account),
    bankName: account.bank_name || null,
    name: account.name || account.subaccount || account.account_number || null,
    iban: account.iban || null,
    balance: bankingAccountBalance(account),
    currency: account.balance_currency || "EUR",
    balanceDate: account.balance_date || account.balance_at || null
  };
}

export function mappedLoanValue(
  mappings: Array<Pick<PropertyLoanAccountMapping, "bankingAccountId" | "lastBalance">>,
  accountMap: Map<number, SerializedBankingAccount>
) {
  return mappings.reduce((sum, mapping) => {
    const live = accountMap.get(mapping.bankingAccountId)?.balance;
    const value = live ?? Number(mapping.lastBalance || 0);
    return sum + Math.abs(value);
  }, 0);
}

export function assetBaseValue(
  asset: Pick<NetWorthAsset, "manualValue" | "bankingAccountId" | "lastSyncedValue">,
  accountMap: Map<number, SerializedBankingAccount>
) {
  const live = asset.bankingAccountId ? accountMap.get(asset.bankingAccountId)?.balance : undefined;
  const persisted = asset.bankingAccountId ? Number(asset.lastSyncedValue || 0) : Number(asset.manualValue || 0);
  return Math.abs(live ?? persisted);
}

export function signedAssetValue(
  asset: Pick<NetWorthAsset, "type" | "manualValue" | "bankingAccountId" | "lastSyncedValue">,
  accountMap: Map<number, SerializedBankingAccount>
) {
  const value = assetBaseValue(asset, accountMap);
  return asset.type === NetWorthAssetType.LIABILITY ? -value : value;
}

export function manualOrSyncedAssetValue(asset: Pick<NetWorthAsset, "type" | "manualValue" | "bankingAccountId" | "lastSyncedValue">) {
  const value = Math.abs(Number((asset.bankingAccountId ? asset.lastSyncedValue : asset.manualValue) || 0));
  return asset.type === NetWorthAssetType.LIABILITY ? -value : value;
}
