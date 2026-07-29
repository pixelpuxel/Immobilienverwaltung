"use client";

import { useState } from "react";

type Config = {
  configured: boolean;
  baseUrl: string;
  lastSuccessfulAt: string | null;
  lastError: string | null;
};

export function BankingIntegrationSettings({ initialConfig }: { initialConfig: Config }) {
  const [config, setConfig] = useState(initialConfig);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(formData: FormData) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/banking-integration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: String(formData.get("baseUrl") || "").trim(),
          apiToken: String(formData.get("apiToken") || "").trim() || undefined
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(body.error || "Banking-Verbindung konnte nicht gespeichert werden.");
        return;
      }
      setConfig(body);
      setMessage("Banking-Verbindung gespeichert.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-line bg-white">
      <div className="flex items-start justify-between gap-3 border-b border-line p-4">
        <div>
          <div className="font-bold">Banking-Daten fuer Nebenkosten</div>
          <p className="mt-1 text-sm text-muted">Das Token bleibt verschluesselt auf dem Server und wird nie an Browser oder Mieter ausgegeben.</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${config.configured ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
          {config.configured ? "verbunden" : "Token fehlt"}
        </span>
      </div>
      <form action={save} className="grid gap-3 p-4">
        <label className="grid gap-1 text-sm font-semibold">
          Banking-URL
          <input name="baseUrl" type="url" required value={config.baseUrl} onChange={(event) => setConfig((current) => ({ ...current, baseUrl: event.target.value }))} />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          API-Token
          <input name="apiToken" type="password" placeholder={config.configured ? "leer lassen, um Token zu behalten" : "Bearer-Token aus dem Banking API-Center"} />
        </label>
        <button disabled={busy} type="submit">{busy ? "Speichere..." : "Banking-Verbindung speichern"}</button>
      </form>
      {config.lastSuccessfulAt || config.lastError || message ? (
        <div className="border-t border-line p-4 text-sm">
          {message ? <div className="font-semibold">{message}</div> : null}
          {config.lastSuccessfulAt ? <div className="text-muted">Letzter erfolgreicher Abruf: {new Date(config.lastSuccessfulAt).toLocaleString("de-DE")}</div> : null}
          {config.lastError ? <div className="mt-1 text-red-700">Letzter Fehler: {config.lastError}</div> : null}
        </div>
      ) : null}
    </section>
  );
}
