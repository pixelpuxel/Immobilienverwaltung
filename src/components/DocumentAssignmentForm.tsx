"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
    router.refresh();
  }

  return (
    <form className="mt-3 grid gap-2 rounded-md bg-panel p-3" onSubmit={save}>
      <div className="text-xs font-semibold text-muted">Zuordnung / verschieben</div>
      <label className="grid gap-1 text-xs font-semibold text-muted">
        Immobilie
        <select name="propertyId" defaultValue={propertyId}>
          <option value="">Keine</option>
          {properties.map((property) => <option key={property.id} value={property.id}>{property.label}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-semibold text-muted">
        Einheit
        <select name="unitId" defaultValue={unitId}>
          <option value="">Keine</option>
          {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-semibold text-muted">
        Kategorie
        <select name="categoryId" defaultValue={categoryId}>
          <option value="">Keine</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
        </select>
      </label>
      {message ? <div className="text-xs text-muted">{message}</div> : null}
      <button className="px-3 py-2 text-sm" type="submit">Zuordnung speichern</button>
    </form>
  );
}
