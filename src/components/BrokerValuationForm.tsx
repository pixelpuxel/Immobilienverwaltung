"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { refreshCurrentView } from "@/lib/client-refresh";

export function BrokerValuationForm({
  propertyId,
  defaultAmount,
  defaultNote
}: {
  propertyId: string;
  defaultAmount?: string;
  defaultNote?: string | null;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/broker-valuations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        propertyId,
        amount: data.amount,
        note: data.note
      })
    });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Speichern fehlgeschlagen." }));
      setMessage(body.error || "Speichern fehlgeschlagen.");
      return;
    }
    setMessage("Schaetzung gespeichert.");
    refreshCurrentView(router);
  }

  return (
    <form className="grid gap-3 rounded-md bg-panel p-4 text-sm" onSubmit={submit}>
      <div>
        <h3 className="font-bold">Kaufpreisschätzung</h3>
        <p className="mt-1 text-muted">Diese Einschätzung sieht der Eigentümer. Andere Makler sehen sie nicht.</p>
      </div>
      {message ? <div className="rounded-md border border-line bg-white p-2 text-xs">{message}</div> : null}
      <label>
        Betrag in EUR
        <input name="amount" inputMode="decimal" defaultValue={defaultAmount || ""} placeholder="z.B. 650000" />
      </label>
      <label>
        Begründung oder Notiz
        <textarea name="note" rows={3} defaultValue={defaultNote || ""} />
      </label>
      <button type="submit" disabled={busy}>{busy ? "Speichere..." : "Schaetzung speichern"}</button>
    </form>
  );
}
