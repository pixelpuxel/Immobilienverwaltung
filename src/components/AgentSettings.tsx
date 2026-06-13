"use client";

import { useState } from "react";

export function AgentSettings({ initialPrompt, initialEnabled }: { initialPrompt: string; initialEnabled: boolean }) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/agent/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemPrompt: prompt, enabled })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(body.error || "Agent-Konfiguration konnte nicht gespeichert werden.");
        return;
      }
      setPrompt(body.systemPrompt);
      setEnabled(body.enabled);
      setMessage("Agent-Konfiguration gespeichert.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-line bg-white">
      <div className="border-b border-line p-4">
        <div className="font-bold">Portal-Agent</div>
        <p className="mt-1 text-sm text-muted">System-Prompt für Web-Chat und Telegram-Agent. Der Verlauf und Langzeitkontext werden gespeichert und in Qdrant indexiert.</p>
      </div>
      <div className="grid gap-3 p-4">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input checked={enabled} onChange={(event) => setEnabled(event.target.checked)} type="checkbox" />
          Agent aktiv
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          System-Prompt
          <textarea className="min-h-48" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
        </label>
        <button disabled={busy} onClick={save} type="button">{busy ? "Speichere..." : "Agent speichern"}</button>
        {message ? <div className="text-sm font-semibold">{message}</div> : null}
      </div>
    </section>
  );
}
