import { Role } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { NetWorthManager } from "@/components/NetWorthManager";
import { StatCard } from "@/components/StatCard";
import { requireUser } from "@/lib/auth";
import { loadBankingAccounts } from "@/lib/banking-integration";
import { mappedLoanValue, serializeBankingAccount, signedAssetValue } from "@/lib/net-worth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NetWorthPage() {
  const user = await requireUser([Role.ADMIN]);
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
      include: { loanAccountMappings: { orderBy: { createdAt: "asc" } } },
      orderBy: { name: "asc" }
    }),
    prisma.netWorthAsset.findMany({
      where: { portalInstanceId: user.portalInstanceId ?? null },
      orderBy: [{ active: "desc" }, { updatedAt: "desc" }]
    })
  ]);

  const propertyRows = properties.map((property) => {
    const liveLoan = mappedLoanValue(property.loanAccountMappings, accountMap);
    return {
      id: property.id,
      name: property.name,
      address: property.address,
      purchasePrice: Number(property.purchasePrice || 0),
      expectedPurchasePrice: Number(property.expectedPurchasePrice || 0),
      outstandingLoan: Number(property.outstandingLoan || 0),
      liveLoan,
      mappings: property.loanAccountMappings.map((mapping) => {
        const account = accountMap.get(mapping.bankingAccountId);
        return {
          id: mapping.id,
          bankingAccountId: mapping.bankingAccountId,
          label: mapping.label,
          lastBalance: Number(mapping.lastBalance || 0),
          accountLabel: account?.label || `Konto ${mapping.bankingAccountId}`,
          liveBalance: account?.balance ?? null
        };
      })
    };
  });

  const assetRows = assets.map((asset) => {
    const signedValue = signedAssetValue(asset, accountMap);
    return {
      id: asset.id,
      name: asset.name,
      type: asset.type as "ASSET" | "LIABILITY",
      manualValue: asset.manualValue === null ? null : Number(asset.manualValue),
      bankingAccountId: asset.bankingAccountId,
      bankingAccountLabel: asset.bankingAccountLabel,
      lastSyncedValue: asset.lastSyncedValue === null ? null : Number(asset.lastSyncedValue),
      note: asset.note,
      active: asset.active,
      liveValue: Math.abs(signedValue),
      signedValue
    };
  });

  const propertyValue = propertyRows.reduce((sum, property) => sum + property.expectedPurchasePrice, 0);
  const loanValue = propertyRows.reduce((sum, property) => sum + (property.liveLoan || property.outstandingLoan), 0);
  const otherAssets = assetRows.filter((item) => item.active && item.signedValue > 0).reduce((sum, item) => sum + item.signedValue, 0);
  const otherLiabilities = Math.abs(assetRows.filter((item) => item.active && item.signedValue < 0).reduce((sum, item) => sum + item.signedValue, 0));
  const totalNetWorth = propertyValue - loanValue + otherAssets - otherLiabilities;

  return (
    <AppShell role={user.role} userId={user.id} email={user.email} canSwitchView={user.role === Role.ADMIN || Boolean(user.impersonatedByAdminId)}>
      <div className="mb-8 overflow-hidden rounded-lg border border-line bg-[radial-gradient(circle_at_top_left,#e6f7ee_0,#ffffff_36%,#eef4ff_100%)] p-6 shadow-sm">
        <div className="max-w-3xl">
          <div className="text-sm font-bold uppercase tracking-wide text-accent">Net Worth</div>
          <h1 className="mt-2 text-3xl font-bold">Vermögen und Darlehen</h1>
          <p className="mt-2 text-muted">Immobilienwerte, valutierte Darlehen und sonstige Vermögenswerte aus manuellen Angaben oder gemappten Bankkonten.</p>
        </div>
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Immobilienwerte" value={money(propertyValue)} detail="Summe der Kaufpreisvorstellungen" icon="IM" tone="emerald" />
        <StatCard label="Darlehen" value={money(loanValue)} detail="Gemappte oder manuelle Valuta" icon="DL" tone="slate" />
        <StatCard label="Immobilien netto" value={money(propertyValue - loanValue)} detail="Immobilienwerte minus Darlehen" icon="NW" tone="blue" />
        <StatCard label="Sonstige Werte" value={money(otherAssets - otherLiabilities)} detail="Weitere Assets minus Verbindlichkeiten" icon="+" tone="amber" />
        <StatCard label="Gesamt-Nettowert" value={money(totalNetWorth)} detail="Immobilien netto plus sonstige Werte" icon="GW" tone="rose" />
      </div>
      <NetWorthManager accounts={accounts} properties={propertyRows} assets={assetRows} bankingError={bankingError} />
    </AppShell>
  );
}

function money(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value || 0);
}
