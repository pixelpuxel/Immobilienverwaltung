"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { refreshCurrentView, reloadCurrentView } from "@/lib/client-refresh";

type TemplateManagerProps = {
  template: {
    id: string;
    name: string;
    filename: string;
    propertyId: string | null;
    unitId: string | null;
    isGlobalTemplate: boolean;
    property?: { id: string; name: string } | null;
    unit?: { id: string; unitNumber: string; property?: { id: string; name: string } | null } | null;
    defaultForUnits?: Array<{ id: string; unitNumber: string; property?: { id: string; name: string } | null }>;
  };
  properties: Array<{ id: string; label: string }>;
  units: Array<{ id: string; label: string; propertyId: string }>;
};

export function TemplateManager({ template, properties, units }: TemplateManagerProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const response = await fetch(`/api/templates/${template.id}`, {
      method: "PATCH",
      body: new FormData(event.currentTarget)
    });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Speichern fehlgeschlagen." }));
      setMessage(body.error || "Speichern fehlgeschlagen.");
      return;
    }
    setMessage("Gespeichert.");
    refreshCurrentView(router);
  }

  async function remove() {
    if (!window.confirm("Diese Vertragsvorlage wirklich loeschen? Bereits erzeugte Verträge bleiben erhalten.")) return;
    setBusy(true);
    const response = await fetch(`/api/templates/${template.id}`, { method: "DELETE" });
    setBusy(false);
    if (response.ok) reloadCurrentView(router);
  }

  return (
    <div className="grid gap-3 rounded-md bg-panel p-3 text-sm">
      <div>
        <div className="font-semibold">{template.name}</div>
        <div className="text-muted">{template.filename}</div>
        <div className="mt-1 flex flex-wrap gap-2 text-xs">
          {template.unit ? <span className="rounded-full bg-white px-2 py-1 font-semibold text-muted">Einheit: {template.unit.property?.name ? `${template.unit.property.name} / ` : ""}{template.unit.unitNumber}</span> : null}
          {template.defaultForUnits?.length ? <span className="rounded-full bg-white px-2 py-1 font-semibold text-muted">Standard fuer {template.defaultForUnits.length} Einheit(en)</span> : null}
          <span className="rounded-full bg-white px-2 py-1 font-semibold text-muted">{template.property ? `Immobilie: ${template.property.name}` : "Keine Immobilie"}</span>
          <span className="rounded-full bg-white px-2 py-1 font-semibold text-muted">{template.isGlobalTemplate ? "Allgemeine Vorlage" : template.unit ? "Nur zugeordnete Einheit" : "Nur zugeordnete Immobilie"}</span>
        </div>
      </div>
      {message ? <div className="rounded-md border border-line bg-white p-2 text-xs">{message}</div> : null}
      <div className="flex flex-wrap gap-2">
        <a className="button-secondary flex min-h-11 min-w-32 flex-none items-center justify-center text-center" href={`/api/templates/${template.id}/preview`} target="_blank" rel="noreferrer">Vorschau</a>
        <a className="button-secondary flex min-h-11 min-w-32 flex-none items-center justify-center text-center" href={`/api/templates/${template.id}/download`}>Download</a>
        <button className="button-secondary min-h-11 min-w-32 flex-none" disabled={busy} type="button" onClick={remove}>Loeschen</button>
      </div>
      <form className="grid gap-2" onSubmit={save}>
        <label>Name<input name="name" defaultValue={template.name} required /></label>
        <label>Immobilie<select name="propertyId" defaultValue={template.propertyId || ""}>
          <option value="">Keine bestimmte Immobilie</option>
          {properties.map((property) => <option key={property.id} value={property.id}>{property.label}</option>)}
        </select></label>
        <label>Einheit<select name="unitId" defaultValue={template.unitId || ""}>
          <option value="">Keine bestimmte Einheit</option>
          {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}
        </select></label>
        <label>Standardvorlage fuer Einheiten<select name="defaultUnitIds" multiple defaultValue={(template.defaultForUnits || []).map((unit) => unit.id)} className="min-h-28">
          {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}
        </select></label>
        <p className="text-xs text-muted">Einheiten mit dieser Standardvorlage verwenden sie automatisch bei der Vertragserzeugung. Mehrfachauswahl mit Cmd/Strg.</p>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input name="isGlobalTemplate" type="checkbox" defaultChecked={template.isGlobalTemplate} />
          Allgemeine Vorlage
        </label>
        <label className="grid gap-1 text-xs font-semibold text-muted">
          Neue DOCX-Version
          <input name="file" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
        </label>
        <button disabled={busy} type="submit">{busy ? "Speichere..." : "Speichern"}</button>
      </form>
    </div>
  );
}
