"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type PropertyItem = {
  id: string;
  name: string;
  address: string;
  objectType: string;
  constructionYear: string;
  livingArea: string;
  unitCount: string;
  rentalStatus: string;
  internalNotes: string;
  documents: number;
};

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
    router.refresh();
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
    router.refresh();
  }

  return (
    <div className="grid gap-4">
      {message ? <div className="rounded-md border border-line bg-panel p-3 text-sm">{message}</div> : null}
      {properties.map((property) => (
        <article key={property.id} className="w-full overflow-hidden rounded-lg border border-line p-4 sm:p-5">
          {editingId === property.id ? (
            <form className="grid gap-3" onSubmit={(event) => updateProperty(event, property.id)}>
              <div className="grid gap-3 md:grid-cols-2">
                <label>Objektname<input name="name" defaultValue={property.name} required /></label>
                <label>Adresse<input name="address" defaultValue={property.address} required /></label>
                <label>Objekttyp<input name="objectType" defaultValue={property.objectType} /></label>
                <label>Baujahr<input name="constructionYear" type="number" defaultValue={property.constructionYear} /></label>
                <label>Wohnflaeche<input name="livingArea" type="number" step="0.01" defaultValue={property.livingArea} /></label>
                <label>Anzahl Einheiten<input name="unitCount" type="number" defaultValue={property.unitCount} /></label>
                <label>Vermietungsstatus<input name="rentalStatus" defaultValue={property.rentalStatus} /></label>
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
