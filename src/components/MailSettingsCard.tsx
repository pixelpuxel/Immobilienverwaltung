"use client";

import { useState } from "react";

export function MailSettingsCard({
  configured,
  smtpHost,
  smtpPort,
  smtpFrom,
  defaultTo
}: {
  configured: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpFrom: string;
  defaultTo: string;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function sendTest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    try {
      const form = new FormData(event.currentTarget);
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 25_000);
      const response = await fetch("/api/mail/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: String(form.get("to") || "") }),
        signal: controller.signal
      }).catch(() => null);
      window.clearTimeout(timeout);
      if (!response) {
        setMessage("Testmail fehlgeschlagen: Portal nicht erreichbar oder Zeitüberschreitung.");
        return;
      }
      const body = await response.json().catch(() => ({}));
      setMessage(response.ok ? `Testmail versendet an ${body.to}.` : body.error || "Testmail fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-3 rounded-lg border border-line bg-white p-4 shadow-sm">
      <div>
        <h2 className="text-xl font-bold">E-Mail-Versand</h2>
        <p className="mt-1 text-sm text-muted">Das Portal verschickt Zugangsdaten über den internen SMTP-Dienst, wenn eine echte E-Mail-Adresse vorhanden ist.</p>
      </div>
      <div className="grid gap-2 rounded-md bg-panel p-3 text-sm">
        <Info label="Status" value={configured ? "konfiguriert" : "nicht konfiguriert"} />
        <Info label="SMTP" value={smtpHost ? `${smtpHost}:${smtpPort}` : "fehlt"} />
        <Info label="Absender" value={smtpFrom || "fehlt"} />
      </div>
      <form className="grid gap-2" onSubmit={sendTest}>
        <label>
          Testmail an
          <input name="to" type="email" defaultValue={defaultTo} required />
        </label>
        <button type="submit" disabled={!configured || busy}>{busy ? "Sende..." : "Testmail senden"}</button>
      </form>
      {message ? <div className="rounded-md border border-line bg-panel p-3 text-sm">{message}</div> : null}
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-semibold text-muted">{label}</span>
      <span className="break-all text-right font-mono text-xs">{value}</span>
    </div>
  );
}
