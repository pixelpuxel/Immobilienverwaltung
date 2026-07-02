"use client";

import { useState } from "react";
import { UploadForm } from "@/components/UploadForm";

type Option = { id: string; label: string; propertyId?: string };

export function DocumentUploadPanel({
  properties,
  units,
  categories,
  defaultPropertyId = "",
  defaultUnitId = "",
  defaultCategoryId = ""
}: {
  properties: Option[];
  units: Option[];
  categories: Option[];
  defaultPropertyId?: string;
  defaultUnitId?: string;
  defaultCategoryId?: string;
}) {
  const initialUnit = units.find((unit) => unit.id === defaultUnitId);
  const [propertyId, setPropertyId] = useState(defaultPropertyId || initialUnit?.propertyId || "");
  const [unitId, setUnitId] = useState(defaultUnitId);
  const filteredUnits = propertyId ? units.filter((unit) => unit.propertyId === propertyId) : units;

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
      <label>Kategorie<select name="categoryId" defaultValue={defaultCategoryId}><option value="">Keine</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}</select></label>
      <label>Status<select name="status"><option value="AVAILABLE">vorhanden</option><option value="REQUESTED">angefragt</option><option value="SHARED">freigegeben</option><option value="MISSING">fehlt</option><option value="NOT_RELEVANT">nicht relevant</option></select></label>
    </UploadForm>
  );
}
