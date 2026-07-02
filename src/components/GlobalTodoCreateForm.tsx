"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type PropertyOption = {
  id: string;
  name: string;
  address?: string | null;
};

export function GlobalTodoCreateForm({ properties }: { properties: PropertyOption[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function createTodo(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const propertyId = String(form.get("propertyId") || "");
    const title = String(form.get("title") || "").trim();
    const dueDate = String(form.get("dueDate") || "") || null;

    if (!propertyId) {
      setMessage("Bitte Immobilie auswählen.");
      return;
    }
    if (!title) {
      setMessage("Bitte Aufgabe eintragen.");
      return;
    }

    setBusy(true);
    const response = await fetch(`/api/properties/${propertyId}/todos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, dueDate })
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setMessage(body.error || "To-do konnte nicht angelegt werden.");
      return;
    }

    formElement.reset();
    setMessage("To-do wurde angelegt.");
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-line bg-panel p-4">
      <h2 className="text-lg font-bold">Neues To-do anlegen</h2>
      <p className="mt-1 text-sm text-muted">Aufgabe einer Immobilie zuordnen. Danach erscheint sie direkt in der zentralen Liste und in der Detailansicht.</p>
      <form className="mt-4 grid gap-3 lg:grid-cols-[minmax(12rem,18rem)_minmax(0,1fr)_12rem_auto] lg:items-end" onSubmit={createTodo}>
        <label className="grid gap-1 text-sm font-semibold">
          Immobilie
          <select name="propertyId" required>
            <option value="">Bitte auswählen</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}{property.address ? ` · ${property.address}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Aufgabe
          <textarea className="min-h-24 resize-y" name="title" placeholder="Zum Beispiel: Energieausweis prüfen, Unterlagen anfordern ..." required />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Fälligkeit
          <input aria-label="Fälligkeit" name="dueDate" type="date" />
        </label>
        <button className="min-h-11 px-4 py-2 text-sm" disabled={busy} type="submit">
          {busy ? "Speichere..." : "Anlegen"}
        </button>
      </form>
      {message ? <div className="mt-3 rounded-md border border-line bg-white p-2 text-sm text-muted">{message}</div> : null}
    </section>
  );
}
