"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type NetWorthAssetTypeValue = "ASSET" | "LIABILITY";

type Account = {
  id: number;
  label: string;
  balance: number;
  currency: string;
  balanceDate: string | null;
};

type PropertyRow = {
  id: string;
  name: string;
  address: string;
  purchasePrice: number;
  expectedPurchasePrice: number;
  outstandingLoan: number;
  liveLoan: number;
  mappings: Array<{
    id: string;
    bankingAccountId: number;
    label: string | null;
    lastBalance: number;
    accountLabel: string;
    liveBalance: number | null;
  }>;
};

type AssetRow = {
  id: string;
  name: string;
  type: NetWorthAssetTypeValue;
  manualValue: number | null;
  bankingAccountId: number | null;
  bankingAccountLabel: string | null;
  lastSyncedValue: number | null;
  note: string | null;
  active: boolean;
  liveValue: number;
  signedValue: number;
};

export function NetWorthManager({
  accounts,
  properties,
  assets,
  bankingError
}: {
  accounts: Account[];
  properties: PropertyRow[];
  assets: AssetRow[];
  bankingError: string | null;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function request(path: string, init: RequestInit) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(path, {
        ...init,
        headers: { "Content-Type": "application/json", ...(init.headers || {}) }
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorMessage = typeof body.error === "string"
          ? body.error
          : typeof body.error?.message === "string"
            ? body.error.message
            : "Aktion fehlgeschlagen.";
        throw new Error(errorMessage);
      }
      setMessage("Gespeichert.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Aktion fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function createAsset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const accountId = String(form.get("bankingAccountId") || "");
    const account = accounts.find((item) => String(item.id) === accountId);
    await request("/api/net-worth/assets", {
      method: "POST",
      body: JSON.stringify({
        name: form.get("name"),
        type: form.get("type"),
        manualValue: form.get("manualValue"),
        bankingAccountId: accountId || null,
        bankingAccountLabel: account?.label || null,
        note: form.get("note"),
        active: true
      })
    });
    event.currentTarget.reset();
  }

  async function updateAsset(event: React.FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const accountId = String(form.get("bankingAccountId") || "");
    const account = accounts.find((item) => String(item.id) === accountId);
    await request(`/api/net-worth/assets/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: form.get("name"),
        type: form.get("type"),
        manualValue: form.get("manualValue"),
        bankingAccountId: accountId || null,
        bankingAccountLabel: account?.label || null,
        note: form.get("note"),
        active: form.get("active") === "on"
      })
    });
  }

  async function deleteAsset(id: string) {
    if (!confirm("Vermögenswert wirklich löschen?")) return;
    await request(`/api/net-worth/assets/${id}`, { method: "DELETE", body: JSON.stringify({}) });
  }

  async function addLoanMapping(event: React.FormEvent<HTMLFormElement>, propertyId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await request("/api/net-worth/property-loans", {
      method: "POST",
      body: JSON.stringify({
        propertyId,
        bankingAccountId: form.get("bankingAccountId"),
        label: form.get("label")
      })
    });
    event.currentTarget.reset();
  }

  async function deleteLoanMapping(id: string) {
    await request(`/api/net-worth/property-loans/${id}`, { method: "DELETE", body: JSON.stringify({}) });
  }

  async function sync() {
    await request("/api/net-worth/sync", { method: "POST", body: JSON.stringify({}) });
  }

  return (
    <div className="grid gap-6">
      {message ? <div className="rounded-md border border-line bg-panel p-3 text-sm">{message}</div> : null}
      {bankingError ? <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{bankingError}</div> : null}

      <section className="rounded-lg border border-line bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-panel p-4">
          <div>
            <h2 className="text-xl font-bold">Banking synchronisieren</h2>
            <p className="mt-1 text-sm text-muted">Aktualisiert gemappte Darlehen und gemappte Kontowerte aus banking.schreiber.info.</p>
          </div>
          <button className="button px-4 py-2" disabled={busy} onClick={sync}>{busy ? "Synchronisiere..." : "Live-Werte einlesen"}</button>
        </div>
      </section>

      <section className="rounded-lg border border-line bg-white shadow-sm">
        <div className="border-b border-line bg-panel p-4">
          <h2 className="text-xl font-bold">Valutierte Darlehen je Immobilie</h2>
          <p className="mt-1 text-sm text-muted">Ordne Darlehenskonten zu. Beim Sync wird das offene Darlehen der Immobilie automatisch aktualisiert.</p>
        </div>
        <div className="divide-y divide-line">
          {properties.map((property) => (
            <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_360px]" key={property.id}>
              <div>
                <div className="text-lg font-bold">{property.name}</div>
                <div className="text-sm text-muted">{property.address}</div>
                <div className="mt-3 grid gap-3 sm:grid-cols-4">
                  <Metric label="Kaufpreis" value={money(property.purchasePrice)} />
                  <Metric label="Kaufpreisvorstellung" value={money(property.expectedPurchasePrice)} />
                  <Metric label="Darlehen aktuell" value={money(property.liveLoan || property.outstandingLoan)} />
                  <Metric label="Immobilien-Nettowert" value={money(property.expectedPurchasePrice - (property.liveLoan || property.outstandingLoan))} />
                </div>
                <div className="mt-3 grid gap-2">
                  {property.mappings.map((mapping) => (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-panel p-3 text-sm" key={mapping.id}>
                      <div>
                        <div className="font-semibold">{mapping.label || mapping.accountLabel}</div>
                        <div className="text-muted">{mapping.accountLabel} · Saldo {money(mapping.liveBalance ?? mapping.lastBalance)}</div>
                      </div>
                      <button className="button-secondary px-3 py-2 text-sm" disabled={busy} onClick={() => deleteLoanMapping(mapping.id)}>Entfernen</button>
                    </div>
                  ))}
                  {!property.mappings.length ? <div className="text-sm text-muted">Noch kein Darlehenskonto zugeordnet.</div> : null}
                </div>
              </div>
              <form className="grid gap-3 rounded-md bg-panel p-3" onSubmit={(event) => addLoanMapping(event, property.id)}>
                <label className="grid gap-1 text-sm font-semibold">
                  Bankkonto
                  <select className="input" name="bankingAccountId" required>
                    <option value="">Konto wählen</option>
                    {accounts.map((account) => <option key={account.id} value={account.id}>{account.label} · {money(account.balance)}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-semibold">
                  Bezeichnung
                  <input className="input" name="label" placeholder="z.B. Darlehen Comdirect" />
                </label>
                <button className="button px-4 py-2" disabled={busy || !accounts.length}>Konto zuordnen</button>
              </form>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-line bg-white shadow-sm">
        <div className="border-b border-line bg-panel p-4">
          <h2 className="text-xl font-bold">Sonstige Vermögenswerte und Verbindlichkeiten</h2>
          <p className="mt-1 text-sm text-muted">Freie Werte oder gemappte Bankkonten, zum Beispiel Girokonto, Festgeld, Firmenanteil, Gold oder weitere Darlehen.</p>
        </div>
        <form className="grid gap-3 border-b border-line p-4 lg:grid-cols-[1fr_180px_160px_1fr_1fr_160px]" onSubmit={createAsset}>
          <input className="input" name="name" placeholder="Name, z.B. Girokonto Comdirect" required />
          <select className="input" name="type">
            <option value="ASSET">Vermögenswert +</option>
            <option value="LIABILITY">Verbindlichkeit -</option>
          </select>
          <input className="input" name="manualValue" placeholder="Manueller Wert" type="number" step="0.01" />
          <select className="input" name="bankingAccountId">
            <option value="">Kein Konto mappen</option>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.label} · {money(account.balance)}</option>)}
          </select>
          <input className="input" name="note" placeholder="Notiz" />
          <button className="button px-4 py-2" disabled={busy}>Anlegen</button>
        </form>
        <div className="divide-y divide-line">
          {assets.map((asset) => (
            <form className="grid gap-3 p-4 lg:grid-cols-[1fr_180px_150px_1fr_1fr_96px_120px]" key={asset.id} onSubmit={(event) => updateAsset(event, asset.id)}>
              <input className="input" defaultValue={asset.name} name="name" />
              <select className="input" defaultValue={asset.type} name="type">
                <option value="ASSET">Vermögenswert +</option>
                <option value="LIABILITY">Verbindlichkeit -</option>
              </select>
              <input className="input" defaultValue={asset.manualValue ?? ""} name="manualValue" type="number" step="0.01" />
              <select className="input" defaultValue={asset.bankingAccountId ?? ""} name="bankingAccountId">
                <option value="">Kein Konto</option>
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.label} · {money(account.balance)}</option>)}
              </select>
              <input className="input" defaultValue={asset.note || ""} name="note" placeholder="Notiz" />
              <label className="flex items-center gap-2 text-sm font-semibold"><input defaultChecked={asset.active} name="active" type="checkbox" /> Aktiv</label>
              <div className="flex gap-2">
                <button className="button-secondary px-3 py-2 text-sm" disabled={busy}>Speichern</button>
                <button className="button-danger px-3 py-2 text-sm" disabled={busy} onClick={(event) => { event.preventDefault(); deleteAsset(asset.id); }} type="button">Löschen</button>
              </div>
              <div className="lg:col-span-7 text-sm text-muted">
                Aktueller Wert: <span className="font-semibold text-text">{money(asset.signedValue)}</span>
                {asset.bankingAccountId ? ` · gemappt: ${asset.bankingAccountLabel || "Bankkonto"} · letzter Sync ${asset.lastSyncedValue === null ? "noch nie" : money(asset.lastSyncedValue)}` : ""}
              </div>
            </form>
          ))}
          {!assets.length ? <div className="p-4 text-sm text-muted">Noch keine sonstigen Vermögenswerte erfasst.</div> : null}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white p-3">
      <div className="text-xs font-bold uppercase text-muted">{label}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  );
}

function money(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value || 0);
}
