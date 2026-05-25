"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CategoryVisibilityForm({
  category
}: {
  category: {
    id: string;
    visibleToBroker: boolean;
    visibleToTenant: boolean;
  };
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/document-categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: category.id,
        visibleToBroker: form.get("visibleToBroker") === "on",
        visibleToTenant: form.get("visibleToTenant") === "on"
      })
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Speichern fehlgeschlagen." }));
      setMessage(body.error || "Speichern fehlgeschlagen.");
      return;
    }
    setMessage("Gespeichert.");
    router.refresh();
  }

  return (
    <form className="flex flex-wrap items-center gap-3" onSubmit={save}>
      <label className="flex items-center gap-2 text-xs font-semibold text-muted">
        <input name="visibleToBroker" type="checkbox" defaultChecked={category.visibleToBroker} />
        Makler
      </label>
      <label className="flex items-center gap-2 text-xs font-semibold text-muted">
        <input name="visibleToTenant" type="checkbox" defaultChecked={category.visibleToTenant} />
        Mieter
      </label>
      <button className="px-3 py-2 text-xs" type="submit">Speichern</button>
      {message ? <span className="text-xs text-muted">{message}</span> : null}
    </form>
  );
}
