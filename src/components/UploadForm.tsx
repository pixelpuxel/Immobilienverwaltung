"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { reloadCurrentView } from "@/lib/client-refresh";

export function UploadForm({ endpoint, children, submitLabel = "Hochladen" }: { endpoint: string; children: React.ReactNode; submitLabel?: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const response = await fetch(endpoint, { method: "POST", body: new FormData(form) });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Upload fehlgeschlagen." }));
      setMessage(body.error || "Upload fehlgeschlagen.");
      return;
    }
    form.reset();
    setMessage("Hochgeladen.");
    reloadCurrentView(router);
  }

  return (
    <form onSubmit={submit} className="grid content-start gap-3 self-start rounded-lg border border-dashed border-line bg-panel p-4">
      {message ? <div className="rounded-md border border-line bg-white p-3 text-sm">{message}</div> : null}
      {children}
      <label className="grid min-h-28 place-items-center rounded-md border border-dashed border-line bg-white p-4 text-center text-sm font-semibold">
        Datei hier auswaehlen oder hineinziehen
        <input className="mt-3" name="file" type="file" required />
      </label>
      <button type="submit">{submitLabel}</button>
    </form>
  );
}
