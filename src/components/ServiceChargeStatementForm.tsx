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

  async function update(id: string, formData: FormData) {
    setBusy(true);
    setMessage("");
    const amount = Number(String(formData.get("amount") || "0").replace(",", "."));
    const response = await fetch(`/api/service-charge-lines?id=${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        unitId: String(formData.get("unitId") || "") || null,
        description: String(formData.get("description") || ""),
        amount,
        treatment: String(formData.get("treatment") || "ALLOCABLE"),
        sourceReference: String(formData.get("sourceReference") || "")
      })
    });
    const body = await response.json().catch(() => ({}));
    setMessage(response.ok ? "Kostenposition geaendert." : body.error || "Speichern fehlgeschlagen.");
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
      <div className="grid gap-3 p-4">
        {lines.map((line) => {
          const unitName = units.find((unit) => unit.id === line.unitId)?.name || "Gesamtobjekt";
          return (
            <article key={line.id} className="rounded-lg border border-line bg-panel p-4">
              <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold">{line.description}</h3>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-muted">{labels[line.treatment] || line.treatment}</span>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-muted">{unitName}</span>
                  </div>
                  {readableSource(line.sourceReference) ? (
                    <p className="mt-2 text-sm text-muted">Quelle: {readableSource(line.sourceReference)}</p>
                  ) : null}
                  {line.note ? <p className="mt-2 text-sm text-muted">Notiz: {line.note}</p> : null}
                </div>
                <div className="text-left md:text-right">
                  <div className="text-lg font-bold">{line.amount.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</div>
                  <div className="mt-2 flex flex-wrap gap-2 md:justify-end">
                    <button className="button button-secondary" disabled={busy} onClick={() => remove(line.id)} type="button">Loeschen</button>
                  </div>
                </div>
              </div>
              <details className="mt-3 rounded-md border border-line bg-white p-3">
                <summary className="cursor-pointer font-semibold">Kostenposition bearbeiten</summary>
                <form action={update.bind(null, line.id)} className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <label className="grid gap-1 text-sm font-semibold xl:col-span-2">Bezeichnung<input name="description" required defaultValue={line.description} /></label>
                  <label className="grid gap-1 text-sm font-semibold">Betrag<input name="amount" inputMode="decimal" required defaultValue={String(line.amount).replace(".", ",")} /></label>
                  <label className="grid gap-1 text-sm font-semibold">Behandlung<select name="treatment" defaultValue={line.treatment}><option value="ALLOCABLE">Umlagefaehig</option><option value="NON_ALLOCABLE">Nicht umlagefaehig</option><option value="RESERVE">Erhaltungsruecklage</option></select></label>
                  <label className="grid gap-1 text-sm font-semibold">Einheit<select name="unitId" defaultValue={line.unitId || ""}><option value="">Gesamtobjekt</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
                  <label className="grid gap-1 text-sm font-semibold md:col-span-2 xl:col-span-4">Quelle / Seite<input name="sourceReference" defaultValue={readableSource(line.sourceReference)} placeholder="z. B. WEG-Abrechnung Seite 4" /></label>
                  <label className="grid gap-1 text-sm font-semibold md:col-span-2 xl:col-span-5">Notiz der Hausverwaltung<textarea name="note" rows={2} defaultValue={line.note || ""} placeholder="Optionale Erlaeuterung zur Position" /></label>
                  <button disabled={busy} type="submit">{busy ? "Speichere..." : "Aenderung speichern"}</button>
                </form>
              </details>
            </article>
          );
        })}
        {!lines.length ? <div className="rounded-lg border border-dashed border-line p-4 text-muted">Noch keine Positionen erfasst.</div> : null}
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

function readableSource(value: string | null) {
  if (!value) return "";
  const withoutTechnicalPrefix = value.replace(/^cm[a-z0-9]{10,}:/i, "");
  return withoutTechnicalPrefix
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
