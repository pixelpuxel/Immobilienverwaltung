"use client";

import { useState } from "react";
import { UploadForm } from "@/components/UploadForm";

type Option = { id: string; label: string; propertyId?: string };
type TenantOption = { id: string; label: string; detail: string; unitId?: string };

export function DocumentUploadPanel({
  properties,
  units,
  tenants,
  categories,
  defaultPropertyId = "",
  defaultUnitId = "",
  defaultTenantId = "",
  defaultCategoryId = ""
}: {
  properties: Option[];
  units: Option[];
  tenants?: TenantOption[];
  categories: Option[];
  defaultPropertyId?: string;
  defaultUnitId?: string;
  defaultTenantId?: string;
  defaultCategoryId?: string;
}) {
  const initialUnit = units.find((unit) => unit.id === defaultUnitId);
  const initialTenant = tenants?.find((tenant) => tenant.id === defaultTenantId);
  const [propertyId, setPropertyId] = useState(defaultPropertyId || initialUnit?.propertyId || "");
  const [unitId, setUnitId] = useState(defaultUnitId || initialTenant?.unitId || "");
  const [tenantId, setTenantId] = useState(defaultTenantId);
  const filteredUnits = propertyId ? units.filter((unit) => unit.propertyId === propertyId) : units;
  const filteredTenants = unitId ? (tenants || []).filter((tenant) => tenant.unitId === unitId) : tenants || [];

  return (
    <UploadForm endpoint="/api/documents">
      <label>Titel<input name="title" /></label>
      <label>
        Immobilie
        <select name="propertyId" value={propertyId} onChange={(event) => {
          setPropertyId(event.currentTarget.value);
          setUnitId("");
        }}>
          <option value="">Keine</option>
          {properties.map((property) => <option key={property.id} value={property.id}>{property.label}</option>)}
        </select>
      </label>
      <label>
        Einheit
        <select name="unitId" value={unitId} onChange={(event) => {
          const nextUnitId = event.currentTarget.value;
          setUnitId(nextUnitId);
          const unit = units.find((item) => item.id === nextUnitId);
          if (unit?.propertyId) setPropertyId(unit.propertyId);
        }}>
          <option value="">Keine</option>
          {filteredUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}
        </select>
      </label>
      <label>
        Mieterbezug
        <select name="tenantProfileId" value={tenantId} onChange={(event) => {
          const nextTenantId = event.currentTarget.value;
          setTenantId(nextTenantId);
          const tenant = tenants?.find((item) => item.id === nextTenantId);
          if (tenant?.unitId) {
            setUnitId(tenant.unitId);
            const unit = units.find((item) => item.id === tenant.unitId);
            if (unit?.propertyId) setPropertyId(unit.propertyId);
          }
        }}>
          <option value="">Kein persönlicher Mieterbezug</option>
          {filteredTenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.label} · {tenant.detail}</option>)}
        </select>
      </label>
      <label>Kategorie<select name="categoryId" defaultValue={defaultCategoryId}><option value="">Keine</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}</select></label>
      <label>Status<select name="status"><option value="AVAILABLE">vorhanden</option><option value="REQUESTED">angefragt</option><option value="SHARED">freigegeben</option><option value="MISSING">fehlt</option><option value="NOT_RELEVANT">nicht relevant</option></select></label>
      <label className="flex items-start gap-3 rounded-md border border-line bg-white p-3 text-sm">
        <input className="mt-1 h-4 w-4" name="runOcr" type="checkbox" value="true" />
        <span>
          <span className="block font-semibold">OCR-Texterkennung ausfuehren</span>
          <span className="block text-xs text-muted">Fuer PDFs und Bilder. Der erkannte Text wird am Dokument gespeichert und in die Suche aufgenommen.</span>
        </span>
      </label>
    </UploadForm>
  );
}
