"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { reloadCurrentView } from "@/lib/client-refresh";

export function DocumentRenameForm({
  documentId,
  filename,
  title
}: {
  documentId: string;
  filename: string;
  title: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    const nextFilename = String(form.get("filename") || "").trim();
    if (!nextFilename) {
      setMessage("Bitte einen Dateinamen angeben.");
      return;
    }
    const response = await fetch(`/api/documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: nextFilename, title })
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Umbenennen fehlgeschlagen." }));
      setMessage(body.error || "Umbenennen fehlgeschlagen.");
      return;
    }
    setMessage("Datei wurde umbenannt.");
    reloadCurrentView(router);
  }

  return (
    <details className="mt-3 rounded-md border border-line bg-white">
      <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-accent">Datei umbenennen</summary>
      <form className="grid gap-2 border-t border-line p-3" onSubmit={save}>
        <label className="grid gap-1 text-xs font-semibold text-muted">
          Neuer Dateiname
          <input className="text-sm" name="filename" defaultValue={filename} />
        </label>
        {message ? <div className="text-xs text-muted">{message}</div> : null}
        <button className="w-fit px-3 py-2 text-sm" type="submit">Dateinamen speichern</button>
      </form>
    </details>
  );
}
