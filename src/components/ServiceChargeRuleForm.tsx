"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type UnitOption = { id: string; name: string; livingArea: number; value: number };

export function ServiceChargeRuleForm({
  propertyId,
  year,
  initialMethod,
  initialTotal,
  initialNote,
  units
}: {
  propertyId: string;
  year: number;
  initialMethod: string;
  initialTotal: number | null;
  initialNote: string;
  units: UnitOption[];
}) {
  const router = useRouter();
  const [method, setMethod] = useState(initialMethod || "AREA");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(formData: FormData) {
    setBusy(true);
    setMessage("");
    try {
      const unitValues = Object.fromEntries(units.map((unit) => [
        unit.id,
        Number(String(formData.get(`unit_${unit.id}`) || "0").replace(",", "."))
      ]));
      const totalRaw = String(formData.get("totalDistributionValue") || "").replace(",", ".");
      const response = await fetch("/api/service-charge-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId,
          year,
          method,
          totalDistributionValue: totalRaw ? Number(totalRaw) : null,
          note: String(formData.get("note") || ""),
          unitValues
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(body.error || "Verteilerschluessel konnte nicht gespeichert werden.");
        return;
      }
      setMessage("Verteilerschluessel gespeichert.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form action={save} className="grid gap-4">
      <label className="grid gap-1 text-sm font-semibold">
        Abrechnungsmodell
        <select name="method" value={method} onChange={(event) => setMethod(event.target.value)}>
          <option value="AREA">Nach Flaeche und Belegungstagen</option>
          <option value="FIXED_SHARE">Feste Anteile und Belegungstage</option>
          <option value="EXTERNAL_STATEMENT">Externe Hausverwaltungsabrechnung</option>
        </select>
      </label>
      {method !== "EXTERNAL_STATEMENT" ? (
        <>
          <label className="grid gap-1 text-sm font-semibold">
            {method === "AREA" ? "Gesamte Verteilerflaeche" : "Gesamte Anteilssumme"}
            <input name="totalDistributionValue" inputMode="decimal" defaultValue={initialTotal ?? ""} placeholder={method === "AREA" ? "z. B. 60,60" : "z. B. 100"} />
          </label>
          <div className="grid gap-2">
            <div className="text-sm font-bold">{method === "AREA" ? "Flaeche je Einheit" : "Anteil je Einheit"}</div>
            {units.map((unit) => (
              <label className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-3 text-sm" key={unit.id}>
                <span>{unit.name}<span className="ml-2 text-muted">Portal: {unit.livingArea || 0}</span></span>
                <input name={`unit_${unit.id}`} inputMode="decimal" defaultValue={unit.value} />
              </label>
            ))}
          </div>
        </>
      ) : (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Hausgeld wird nicht verteilt. Umlagefaehige Einzelkosten werden spaeter aus der Abrechnung der Hausverwaltung uebernommen.
        </div>
      )}
      <label className="grid gap-1 text-sm font-semibold">Interne Notiz<textarea name="note" defaultValue={initialNote} rows={3} /></label>
      <button disabled={busy} type="submit">{busy ? "Speichere..." : "Verteilerschluessel speichern"}</button>
      {message ? <div className="text-sm font-semibold">{message}</div> : null}
    </form>
  );
}
