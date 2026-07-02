"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { refreshCurrentView } from "@/lib/client-refresh";

type RoleName = "ADMIN" | "BROKER" | "TENANT";
type PropertyOption = { id: string; name: string };
type UnitOption = { id: string; label: string };

export function UserAccessEditor({
  userId,
  role,
  propertyIds,
  unitId,
  moveInDate,
  moveOutDate,
  isCurrent,
  properties,
  units
}: {
  userId: string;
  role: RoleName;
  propertyIds: string[];
  unitId: string;
  moveInDate?: string;
  moveOutDate?: string;
  isCurrent?: boolean;
  properties: PropertyOption[];
  units: UnitOption[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [moveOutValue, setMoveOutValue] = useState(moveOutDate || "");

  if (role === "ADMIN") {
    return <div className="text-sm text-muted">Vollzugriff</div>;
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    const payload = role === "BROKER"
      ? { propertyIds: form.getAll("propertyIds").map(String) }
      : {
          unitId: String(form.get("unitId") || "") || null,
          moveInDate: normalizeDateValue(String(form.get("moveInDate") || "")) || null,
          moveOutDate: normalizeDateValue(String(form.get("moveOutDate") || "")) || null,
          isCurrent: form.get("isCurrent") === "on"
        };

    const response = await fetch(`/api/users/${userId}/access`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Rechte konnten nicht gespeichert werden." }));
      setMessage(body.error || "Rechte konnten nicht gespeichert werden.");
      return;
    }
    setMessage("Änderungen übernommen.");
    refreshCurrentView(router);
  }

  return (
    <form className="grid gap-2" onSubmit={save}>
      {role === "BROKER" ? (
        <label className="grid gap-1 text-xs font-semibold text-muted">
          Freigegebene Immobilien
          <select className="min-h-28 text-sm" name="propertyIds" multiple defaultValue={propertyIds}>
            {properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
          </select>
        </label>
      ) : (
        <>
          <label className="grid gap-1 text-xs font-semibold text-muted">
            Zugeordnete Einheit
            <select className="text-sm" name="unitId" defaultValue={unitId}>
              <option value="">Keine Einheit</option>
              {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-muted">
            Einzug
            <input className="text-sm" name="moveInDate" type="date" defaultValue={moveInDate || ""} onBlur={(event) => {
              event.currentTarget.value = normalizeDateValue(event.currentTarget.value);
            }} />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-muted">
            Auszug
            <span className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <input className="text-sm" name="moveOutDate" type="date" value={moveOutValue} onBlur={(event) => {
                setMoveOutValue(normalizeDateValue(event.currentTarget.value));
              }} onChange={(event) => setMoveOutValue(event.currentTarget.value)} />
              <button className="button-secondary px-3 py-2 text-sm" onClick={() => setMoveOutValue("")} type="button">Datum loeschen</button>
            </span>
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-muted">
            <input name="isCurrent" type="checkbox" defaultChecked={isCurrent ?? true} />
            laufend
          </label>
        </>
      )}
      {message ? <div className="text-xs text-muted">{message}</div> : null}
      <button className="px-3 py-2 text-sm" type="submit">Änderungen übernehmen</button>
    </form>
  );
}

function normalizeDateValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const iso = trimmed.match(/^(\d{1,4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const year = normalizeYear(iso[1]);
    return `${year}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }
  const german = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{1,4})$/);
  if (german) {
    const year = normalizeYear(german[3]);
    return `${year}-${german[2].padStart(2, "0")}-${german[1].padStart(2, "0")}`;
  }
  return trimmed;
}

function normalizeYear(value: string) {
  const year = Number(value);
  if (!Number.isFinite(year)) return value.padStart(4, "0");
  if (year >= 100) return String(year).padStart(4, "0");
  return String(2000 + year).padStart(4, "0");
}
