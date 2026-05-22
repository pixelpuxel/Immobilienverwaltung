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

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const raw = Object.fromEntries(new FormData(event.currentTarget));
    const payload = transform ? transform(raw) : raw;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Speichern fehlgeschlagen." }));
      setMessage(body.error || "Speichern fehlgeschlagen.");
      return;
    }
    event.currentTarget.reset();
    setMessage("Gespeichert.");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-lg border border-line bg-panel p-4">
      {message ? <div className="rounded-md border border-line bg-white p-3 text-sm">{message}</div> : null}
      {children}
      <button type="submit">{submitLabel}</button>
    </form>
  );
}
