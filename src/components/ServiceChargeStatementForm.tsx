"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Line = {
  id: string;
  unitId: string | null;
  description: string;
  amount: number;
  treatment: string;
  sourceReference: string | null;
  note: string | null;
};

export function ServiceChargeStatementForm({
  propertyId,
  year,
  units,
  lines
}: {
  propertyId: string;
  year: number;
  units: Array<{ id: string; name: string }>;
  lines: Line[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function add(formData: FormData) {
    setBusy(true);
    setMessage("");
    const amount = Number(String(formData.get("amount") || "0").replace(",", "."));
    const response = await fetch("/api/service-charge-lines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        propertyId,
        year,
        unitId: String(formData.get("unitId") || "") || null,
        description: String(formData.get("description") || ""),
        amount,
        treatment: String(formData.get("treatment") || "ALLOCABLE"),
        sourceReference: String(formData.get("sourceReference") || ""),
        note: String(formData.get("note") || "")
      })
    });
    const body = await response.json().catch(() => ({}));
    setMessage(response.ok ? "Kostenposition gespeichert." : body.error || "Speichern fehlgeschlagen.");
    setBusy(false);
    if (response.ok) router.refresh();
  }

  async function remove(id: string) {
    setBusy(true);
    const response = await fetch(`/api/service-charge-lines?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setBusy(false);
    if (response.ok) router.refresh();
  }

  const labels: Record<string, string> = {
    ALLOCABLE: "Umlagefaehig",
    NON_ALLOCABLE: "Nicht umlagefaehig",
    RESERVE: "Erhaltungsruecklage"
  };
  const totals = lines.reduce((result, line) => {
    result.total += line.amount;
    result[line.treatment] = (result[line.treatment] || 0) + line.amount;
    return result;
  }, { total: 0, ALLOCABLE: 0, NON_ALLOCABLE: 0, RESERVE: 0 } as Record<string, number>);
  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-line bg-white">
      <div className="border-b border-line p-5">
        <div className="text-sm font-bold uppercase text-accent">Hausverwaltungsabrechnung {year}</div>
        <h2 className="mt-1 text-xl font-bold">Einzelkosten uebernehmen</h2>
        <p className="mt-1 text-sm text-muted">Hausgeldzahlungen werden nicht verteilt. Hier werden die Positionen der Jahresabrechnung getrennt erfasst.</p>
      </div>
      <form action={add} className="grid gap-3 border-b border-line bg-panel p-4 md:grid-cols-2 xl:grid-cols-5">
        <label className="grid gap-1 text-sm font-semibold xl:col-span-2">Bezeichnung<input name="description" required placeholder="z. B. Gebaeudeversicherung" /></label>
        <label className="grid gap-1 text-sm font-semibold">Betrag<input name="amount" inputMode="decimal" required placeholder="0,00" /></label>
        <label className="grid gap-1 text-sm font-semibold">Behandlung<select name="treatment"><option value="ALLOCABLE">Umlagefaehig</option><option value="NON_ALLOCABLE">Nicht umlagefaehig</option><option value="RESERVE">Erhaltungsruecklage</option></select></label>
        <label className="grid gap-1 text-sm font-semibold">Einheit<select name="unitId"><option value="">Gesamtobjekt</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-semibold md:col-span-2 xl:col-span-4">Quelle / Seite<input name="sourceReference" placeholder="z. B. WEG-Abrechnung Seite 4" /></label>
        <label className="grid gap-1 text-sm font-semibold md:col-span-2 xl:col-span-5">Notiz der Hausverwaltung<textarea name="note" rows={2} placeholder="Optionale Erlaeuterung zur Position" /></label>
        <button disabled={busy} type="submit">{busy ? "Speichere..." : "Position hinzufuegen"}</button>
        {message ? <div className="text-sm font-semibold md:col-span-2 xl:col-span-5">{message}</div> : null}
      </form>
      <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Umlagefaehig" value={totals.ALLOCABLE} />
        <Metric label="Nicht umlagefaehig" value={totals.NON_ALLOCABLE} />
        <Metric label="Erhaltungsruecklage" value={totals.RESERVE} />
        <Metric label="Gesamtsumme" value={totals.total} />
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-panel text-left"><tr><th className="p-3">Position</th><th className="p-3">Behandlung</th><th className="p-3">Einheit</th><th className="p-3 text-right">Betrag</th><th className="p-3" /></tr></thead>
          <tbody className="divide-y divide-line">
            {lines.map((line) => <tr key={line.id}><td className="p-3"><div className="font-semibold">{line.description}</div><div className="text-muted">{line.sourceReference || "-"}</div>{line.note ? <div className="mt-1 text-xs text-muted">{line.note}</div> : null}</td><td className="p-3">{labels[line.treatment] || line.treatment}</td><td className="p-3">{units.find((unit) => unit.id === line.unitId)?.name || "Gesamtobjekt"}</td><td className="p-3 text-right font-bold">{line.amount.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</td><td className="p-3 text-right"><button className="button button-secondary" disabled={busy} onClick={() => remove(line.id)} type="button">Loeschen</button></td></tr>)}
            {!lines.length ? <tr><td className="p-4 text-muted" colSpan={5}>Noch keine Positionen erfasst.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-panel p-3">
      <div className="text-xs font-bold uppercase text-muted">{label}</div>
      <div className="mt-1 text-lg font-bold">{value.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</div>
    </div>
  );
}
