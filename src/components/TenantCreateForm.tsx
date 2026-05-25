"use client";

import { useMemo, useState } from "react";

type TenantUnit = {
  id: string;
  label: string;
  rentAmount: string;
  garageRent: string;
  serviceCharges: string;
};

type TenantCreateFormProps = {
  units: TenantUnit[];
  defaultUnitId?: string;
  compact?: boolean;
};

type Message = { type: "ok" | "error"; text: string } | null;

export function TenantCreateForm({ units, defaultUnitId = "", compact = false }: TenantCreateFormProps) {
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState(false);
  const unitMap = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);
  const initialUnit = defaultUnitId ? unitMap.get(defaultUnitId) : null;
  const [selectedUnitId, setSelectedUnitId] = useState(defaultUnitId);
  const [rentAmount, setRentAmount] = useState(initialUnit?.rentAmount || "");
  const [garageRent, setGarageRent] = useState(initialUnit?.garageRent || "");
  const [serviceCharges, setServiceCharges] = useState(initialUnit?.serviceCharges || "");
  const [deposit, setDeposit] = useState(suggestDeposit(initialUnit));

  function applyUnit(unitId: string) {
    const unit = unitMap.get(unitId);
    setSelectedUnitId(unitId);
    setRentAmount(unit?.rentAmount || "");
    setGarageRent(unit?.garageRent || "");
    setServiceCharges(unit?.serviceCharges || "");
    setDeposit(suggestDeposit(unit));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const payload = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => null);
    setBusy(false);
    if (!response) {
      setMessage({ type: "error", text: "Speichern fehlgeschlagen. Die Verbindung zum Portal konnte nicht hergestellt werden." });
      return;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage({ type: "error", text: data.error || "Mieter konnte nicht angelegt werden." });
      return;
    }
    setMessage({ type: "ok", text: "Mieter wurde angelegt." });
    window.location.reload();
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-lg border border-line bg-panel p-4">
      {message ? (
        <div className={`rounded-md border border-line bg-white p-3 text-sm ${message.type === "error" ? "text-red-700" : "text-accent"}`}>
          {message.text}
        </div>
      ) : null}
      <div>
        <h2 className="text-xl font-bold">Mieter anlegen</h2>
        <p className="mt-1 text-sm text-muted">Benutzername, Vorname oder Nachname reicht. Mietwerte werden aus der Einheit vorgeschlagen und koennen geaendert werden.</p>
      </div>
      <label>Vorname<input name="firstName" /></label>
      <label>Nachname<input name="lastName" /></label>
      <label>Benutzername<input name="username" placeholder={compact ? "z. B. jonas-ditmann" : undefined} /></label>
      <label>E-Mail<input name="email" type="email" /></label>
      <label>Startpasswort<input name="password" type="text" defaultValue="BitteSofortAendern123!" /></label>
      <label>
        Einheit
        <select name="unitId" value={selectedUnitId} onChange={(event) => applyUnit(event.target.value)}>
          <option value="">Keine</option>
          {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}
        </select>
      </label>
      <input type="hidden" name="isCurrent" value="false" />
      <label className="flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold">
        <input className="h-4 w-4" name="isCurrent" type="checkbox" defaultChecked />
        laufender Mieter
      </label>
      <details className="rounded-md bg-white p-3" open={!compact}>
        <summary className="cursor-pointer font-semibold">Weitere Vertragsdaten</summary>
        <div className="mt-3 grid gap-3">
          <label>Geburtsdatum<input name="birthdate" type="date" /></label>
          <label>Telefon<input name="phone" /></label>
          <label>Aktuelle Anschrift<input name="currentAddress" /></label>
          <label>Einzugsdatum<input name="moveInDate" type="date" /></label>
          <label>Mietbeginn<input name="leaseStartDate" type="date" /></label>
          <label>Kaltmiete<input name="rentAmount" inputMode="decimal" value={rentAmount} onChange={(event) => setRentAmount(event.target.value)} /></label>
          <label>Tiefgarage<input name="garageRent" inputMode="decimal" value={garageRent} onChange={(event) => setGarageRent(event.target.value)} /></label>
          <label>Nebenkosten<input name="serviceCharges" inputMode="decimal" value={serviceCharges} onChange={(event) => setServiceCharges(event.target.value)} /></label>
          <label>Kaution<input name="deposit" inputMode="decimal" value={deposit} onChange={(event) => setDeposit(event.target.value)} /></label>
          <label>Anzahl Bewohner<input name="occupantCount" inputMode="numeric" /></label>
          <label>Zahlung bis Werktag<input name="rentDueDay" inputMode="numeric" defaultValue="1" /></label>
          <label>Vermieter-Bank<input name="landlordBankName" /></label>
          <label>Vermieter-IBAN<input name="landlordBankAccount" /></label>
          <label>Zimmer / Mietgegenstand<textarea name="roomDescription" rows={3} /></label>
          <label>Mitbenutzte Raeume<textarea name="sharedRooms" rows={3} /></label>
          <label>Staffelmiete<textarea name="steppedRent" rows={4} /></label>
          <label>Besondere Vertragsnotizen<textarea name="contractNotes" rows={4} /></label>
          <label>Haustiere<textarea name="pets" rows={2} /></label>
          <label>Besondere Vereinbarungen<textarea name="specialAgreements" rows={4} /></label>
        </div>
      </details>
      <button type="submit" disabled={busy}>{busy ? "Speichert..." : "Mieter anlegen"}</button>
    </form>
  );
}

function suggestDeposit(unit?: TenantUnit | null) {
  if (!unit) return "";
  const coldRent = numberValue(unit.rentAmount) + numberValue(unit.garageRent);
  return coldRent ? formatNumber(coldRent * 3) : "";
}

function numberValue(value: string) {
  return Number(String(value || "").replace(",", ".")) || 0;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
