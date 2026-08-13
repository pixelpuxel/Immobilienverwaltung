"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { refreshCurrentView } from "@/lib/client-refresh";

export function DocumentYearForm({ documentId, documentYear }: { documentId: string; documentYear?: number | null }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const rawYear = String(form.get("documentYear") || "").trim();
    const response = await fetch(`/api/documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentYear: rawYear ? Number(rawYear) : null })
    });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Jahr konnte nicht gespeichert werden." }));
      setMessage(body.error || "Jahr konnte nicht gespeichert werden.");
      return;
    }
    setMessage(rawYear ? `Jahr ${rawYear} gespeichert.` : "Jahr entfernt. Automatische Erkennung wird genutzt.");
    refreshCurrentView(router);
  }

  return (
    <form className="mt-3 grid gap-2 rounded-md bg-panel p-3 text-xs sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={save}>
      <label className="grid gap-1 font-semibold text-muted">
        Jahr / Ordner
        <input
          className="text-sm"
          defaultValue={documentYear || ""}
          inputMode="numeric"
          max={2049}
          min={1900}
          name="documentYear"
          placeholder="Automatisch"
          type="number"
        />
      </label>
      <button className="self-end px-3 py-2 text-sm" disabled={busy} type="submit">{busy ? "Speichert..." : "Jahr speichern"}</button>
      {message ? <div className="text-muted sm:col-span-2">{message}</div> : null}
    </form>
  );
}
