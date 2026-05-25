"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function JsonForm({
  endpoint,
  children,
  submitLabel = "Speichern",
  transform
}: {
  endpoint: string;
  children: React.ReactNode;
  submitLabel?: string;
  transform?: (data: Record<string, FormDataEntryValue>) => Record<string, unknown>;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    const raw = Object.fromEntries(new FormData(event.currentTarget));
    const payload = transform ? transform(raw) : raw;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => null);
    setBusy(false);
    if (!response) {
      setMessage("Speichern fehlgeschlagen. Die Verbindung zum Portal konnte nicht hergestellt werden.");
      return;
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Speichern fehlgeschlagen." }));
      const issues = Array.isArray(body.issues)
        ? body.issues.map((issue: { path?: Array<string | number>; message?: string }) => `${fieldLabel(issue.path?.join("."))}: ${issue.message || "ungueltig"}`).join(" · ")
        : "";
      setMessage([body.error || "Speichern fehlgeschlagen.", issues].filter(Boolean).join(" "));
      return;
    }
    event.currentTarget.reset();
    setMessage("Gespeichert.");
    router.refresh();
    window.location.reload();
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-lg border border-line bg-panel p-4">
      {message ? <div className="rounded-md border border-line bg-white p-3 text-sm">{message}</div> : null}
      {children}
      <button type="submit" disabled={busy}>{busy ? "Speichert..." : submitLabel}</button>
    </form>
  );
}

function fieldLabel(path?: string) {
  const labels: Record<string, string> = {
    name: "Objektname",
    address: "Adresse",
    email: "E-Mail",
    password: "Passwort"
  };
  return labels[path || ""] || path || "Feld";
}
