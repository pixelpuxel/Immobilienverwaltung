"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { reloadCurrentView } from "@/lib/client-refresh";
import { QuickMoneyEdit } from "./QuickMoneyEdit";

type PropertyItem = {
  id: string;
  name: string;
  address: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  country: string;
  latitude: string;
  longitude: string;
  objectType: string;
  constructionYear: string;
  livingArea: string;
  unitCount: string;
  rentalStatus: string;
  expectedPurchasePrice: string;
  outstandingLoan: string;
  annualColdRent: number;
  internalNotes: string;
  documents: number;
};

const rentalStatuses = ["offen", "frei", "teilvermietet", "voll vermietet", "leerstehend", "reserviert", "in Sanierung"];

export function PropertyManager({ properties }: { properties: PropertyItem[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function updateProperty(event: React.FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    setMessage("");
    const payload = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch(`/api/properties/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Aenderung fehlgeschlagen." }));
      setMessage(body.error || "Aenderung fehlgeschlagen.");
      return;
    }
    setEditingId(null);
    setMessage("Immobilie wurde geaendert.");
    reloadCurrentView(router);
  }

  async function deleteProperty(id: string, name: string) {
    if (!window.confirm(`Immobilie "${name}" wirklich loeschen? Zugehoerige Einheiten und Dokumentzuordnungen werden ebenfalls entfernt.`)) {
      return;
    }
    setMessage("");
    const response = await fetch(`/api/properties/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Loeschen fehlgeschlagen." }));
      setMessage(body.error || "Loeschen fehlgeschlagen.");
      return;
    }
    setMessage("Immobilie wurde geloescht.");
    reloadCurrentView(router);
  }

  return (
    <div className="grid gap-4">
      {message ? <div className="rounded-md border border-line bg-panel p-3 text-sm">{message}</div> : null}
      {properties.map((property) => (
        <article key={property.id} className="w-full overflow-hidden rounded-lg border border-line p-4 sm:p-5">
          {editingId === property.id ? (
            <form className="grid gap-3" onSubmit={(event) => updateProperty(event, property.id)}>
              <div className="grid gap-3 md:grid-cols-2">
                <label>Objektname <span className="text-accent">*</span><input name="name" defaultValue={property.name} required /></label>
                <label>Adresse frei lesbar<input name="address" defaultValue={property.address} /></label>
                <label>Straße<input name="street" defaultValue={property.street} /></label>
                <label>Hausnummer<input name="houseNumber" defaultValue={property.houseNumber} /></label>
                <label>PLZ<input name="postalCode" inputMode="numeric" defaultValue={property.postalCode} /></label>
                <label>Ort<input name="city" defaultValue={property.city} /></label>
                <label>Land<input name="country" defaultValue={property.country || "Deutschland"} /></label>
                <label>Breitengrad<input name="latitude" type="number" step="0.000001" defaultValue={property.latitude} /></label>
                <label>Längengrad<input name="longitude" type="number" step="0.000001" defaultValue={property.longitude} /></label>
                <label>Objekttyp<input name="objectType" defaultValue={property.objectType} /></label>
                <label>Baujahr<input name="constructionYear" type="number" defaultValue={property.constructionYear} /></label>
                <label>Wohnflaeche<input name="livingArea" type="number" step="0.01" defaultValue={property.livingArea} /></label>
                <label>Anzahl Einheiten<input name="unitCount" type="number" defaultValue={property.unitCount} /></label>
                <label>Vermietungsstatus<select name="rentalStatus" defaultValue={property.rentalStatus || "offen"}>{rentalStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
                <label>Kaufpreisvorstellung<input name="expectedPurchasePrice" type="number" step="0.01" defaultValue={property.expectedPurchasePrice} /></label>
                <label>Valutiertes Darlehen<input name="outstandingLoan" type="number" step="0.01" defaultValue={property.outstandingLoan} /></label>
                <label>Interne Notizen<textarea name="internalNotes" defaultValue={property.internalNotes} /></label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="submit">Aenderungen speichern</button>
                <button className="button-secondary" type="button" onClick={() => setEditingId(null)}>Abbrechen</button>
              </div>
            </form>
          ) : (
            <>
              <div className="grid gap-3 sm:flex sm:items-start sm:justify-between sm:gap-4">
                <div>
                  <h2 className="text-xl font-bold">
                    <Link className="hover:text-accent" href={`/properties/${property.id}`}>{property.name}</Link>
                  </h2>
                  <p className="text-muted">{property.address}</p>
                </div>
                <span className="rounded-full bg-panel px-3 py-1 text-sm">{property.rentalStatus || "offen"}</span>
              </div>
              <div className="mt-4 grid gap-3 text-sm md:grid-cols-4">
                <div>{property.objectType || "Objekt"}</div>
                <div>{property.unitCount || "0"} Einheiten</div>
                <div>{property.livingArea || "-"} qm Wohnflaeche</div>
                <div>{property.documents} Dokumente</div>
              </div>
              <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                <QuickMoneyEdit endpoint={`/api/properties/${property.id}`} field="expectedPurchasePrice" label="Kaufpreisvorstellung" value={property.expectedPurchasePrice} />
                <QuickMoneyEdit endpoint={`/api/properties/${property.id}`} field="outstandingLoan" label="Valutiertes Darlehen" value={property.outstandingLoan} />
                <div className="rounded-md bg-panel p-3">
                  <div className="text-xs font-semibold text-muted">Rendite</div>
                  <div className="mt-1 font-semibold">{yieldText(property.annualColdRent, Number(property.expectedPurchasePrice || 0))}</div>
                </div>
                <div className="rounded-md bg-panel p-3">
                  <div className="text-xs font-semibold text-muted">Gehebelte Rendite</div>
                  <div className="mt-1 font-semibold">{yieldText(property.annualColdRent, Number(property.expectedPurchasePrice || 0) - Number(property.outstandingLoan || 0))}</div>
                </div>
              </div>
              <div className="mt-5 grid gap-2 sm:flex sm:flex-wrap">
                <Link className="button block text-center" href={`/properties/${property.id}`}>Details ansehen</Link>
                <button className="button-secondary" type="button" onClick={() => setEditingId(property.id)}>Bearbeiten</button>
                <button className="bg-red-700" type="button" onClick={() => deleteProperty(property.id, property.name)}>Loeschen</button>
              </div>
            </>
          )}
        </article>
      ))}
    </div>
  );
}

function yieldText(annualColdRent: number, base: number) {
  if (!base || base <= 0) return "offen";
  return new Intl.NumberFormat("de-DE", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(annualColdRent / base);
}
