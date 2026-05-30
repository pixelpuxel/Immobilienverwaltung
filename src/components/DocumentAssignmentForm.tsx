"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { reloadCurrentView } from "@/lib/client-refresh";

type Option = { id: string; label: string; propertyId?: string };

export function DocumentAssignmentForm({
  documentId,
  propertyId,
  unitId,
  categoryId,
  properties,
  units,
  categories
}: {
  documentId: string;
  propertyId: string;
  unitId: string;
  categoryId: string;
  properties: Option[];
  units: Option[];
  categories: Option[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    const selectedUnitId = String(form.get("unitId") || "");
    const selectedUnit = units.find((unit) => unit.id === selectedUnitId);
    const payload = {
      propertyId: selectedUnit?.propertyId || String(form.get("propertyId") || "") || null,
      unitId: selectedUnitId || null,
      categoryId: String(form.get("categoryId") || "") || null,
      scope: selectedUnitId ? "UNIT" : "PROPERTY"
    };
    const response = await fetch(`/api/documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Zuordnung fehlgeschlagen." }));
      setMessage(body.error || "Zuordnung fehlgeschlagen.");
      return;
    }
    setMessage("Zuordnung gespeichert.");
    reloadCurrentView(router);
  }

  return (
    <details className="mt-3 rounded-md border border-line bg-white">
      <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-accent">Zuordnung ändern</summary>
      <form className="grid gap-3 border-t border-line p-3" onSubmit={save}>
        <div className="grid gap-2 md:grid-cols-3">
          <label className="grid gap-1 text-xs font-semibold text-muted">
            Immobilie
            <select className="text-sm" name="propertyId" defaultValue={propertyId}>
              <option value="">Keine</option>
              {properties.map((property) => <option key={property.id} value={property.id}>{property.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-muted">
            Einheit
            <select className="text-sm" name="unitId" defaultValue={unitId}>
              <option value="">Keine</option>
              {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-muted">
            Kategorie
            <select className="text-sm" name="categoryId" defaultValue={categoryId}>
              <option value="">Keine</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
            </select>
          </label>
        </div>
        {message ? <div className="text-xs text-muted">{message}</div> : null}
        <button className="w-fit px-3 py-2 text-sm" type="submit">Zuordnung speichern</button>
      </form>
    </details>
  );
}
