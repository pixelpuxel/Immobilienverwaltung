"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { reloadCurrentView } from "@/lib/client-refresh";

type Option = { id: string; label: string; propertyId?: string };
type TenantOption = { id: string; label: string; detail: string; unitId?: string };

export function DocumentAssignmentForm({
  documentId,
  propertyId,
  unitId,
  tenantProfileId,
  categoryId,
  properties,
  units,
  tenants,
  categories
}: {
  documentId: string;
  propertyId: string;
  unitId: string;
  tenantProfileId: string;
  categoryId: string;
  properties: Option[];
  units: Option[];
  tenants: TenantOption[];
  categories: Option[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState(propertyId);
  const [selectedUnitId, setSelectedUnitId] = useState(unitId);
  const [selectedTenantId, setSelectedTenantId] = useState(tenantProfileId);
  const filteredUnits = selectedPropertyId ? units.filter((unit) => unit.propertyId === selectedPropertyId) : units;
  const filteredTenants = selectedUnitId ? tenants.filter((tenant) => tenant.unitId === selectedUnitId) : tenants;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    const selectedUnit = units.find((unit) => unit.id === selectedUnitId);
    const payload = {
      propertyId: selectedUnit?.propertyId || String(form.get("propertyId") || "") || null,
      unitId: selectedUnitId || null,
      tenantProfileId: selectedTenantId || null,
      categoryId: String(form.get("categoryId") || "") || null,
      scope: selectedTenantId ? "TENANT" : selectedUnitId ? "UNIT" : "PROPERTY"
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
        <div className="grid gap-2 md:grid-cols-4">
          <label className="grid gap-1 text-xs font-semibold text-muted">
            Immobilie
            <select className="text-sm" name="propertyId" value={selectedPropertyId} onChange={(event) => {
              setSelectedPropertyId(event.currentTarget.value);
              setSelectedUnitId("");
            }}>
              <option value="">Keine</option>
              {properties.map((property) => <option key={property.id} value={property.id}>{property.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-muted">
            Einheit
            <select className="text-sm" name="unitId" value={selectedUnitId} onChange={(event) => {
              setSelectedUnitId(event.currentTarget.value);
              setSelectedTenantId("");
            }}>
              <option value="">Keine</option>
              {filteredUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-muted">
            Mieterbezug
            <select className="text-sm" name="tenantProfileId" value={selectedTenantId} onChange={(event) => {
              const nextTenantId = event.currentTarget.value;
              setSelectedTenantId(nextTenantId);
              const tenant = tenants.find((item) => item.id === nextTenantId);
              if (tenant?.unitId) {
                setSelectedUnitId(tenant.unitId);
                const unit = units.find((item) => item.id === tenant.unitId);
                if (unit?.propertyId) setSelectedPropertyId(unit.propertyId);
              }
            }}>
              <option value="">Kein persönlicher Bezug</option>
              {filteredTenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.label} · {tenant.detail}</option>)}
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
