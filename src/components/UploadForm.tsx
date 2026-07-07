"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { reloadCurrentView } from "@/lib/client-refresh";

export function UploadForm({ endpoint, children, submitLabel = "Hochladen", multiple = true }: { endpoint: string; children: React.ReactNode; submitLabel?: string; multiple?: boolean }) {
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
    const body = await response.json().catch(() => null);
    form.reset();
    setMessage(body?.count ? `${body.count} Dateien hochgeladen.` : "Hochgeladen.");
    reloadCurrentView(router);
  }

  return (
    <form onSubmit={submit} className="grid content-start gap-3 self-start rounded-lg border border-dashed border-line bg-panel p-4">
      {message ? <div className="rounded-md border border-line bg-white p-3 text-sm">{message}</div> : null}
      {children}
      <label className="grid min-h-28 place-items-center rounded-md border border-dashed border-line bg-white p-4 text-center text-sm font-semibold">
        {multiple ? "Datei(en) hier auswaehlen oder hineinziehen" : "Datei hier auswaehlen oder hineinziehen"}
        {multiple ? <span className="mt-1 text-xs font-normal text-muted">Mehrere Dateien erhalten dieselben Metadaten.</span> : null}
        <input className="mt-3" name="file" type="file" required multiple={multiple} />
      </label>
      <button type="submit">{submitLabel}</button>
    </form>
  );
}
