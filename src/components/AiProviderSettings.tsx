"use client";

import { useState } from "react";

type AiConfig = {
  configured: boolean;
  provider: string;
  embeddingModel: string;
  transcriptionModel: string;
};

const defaults = {
  openai: { embeddingModel: "text-embedding-3-small", transcriptionModel: "gpt-4o-mini-transcribe" },
  gemini: { embeddingModel: "text-embedding-004", transcriptionModel: "gemini-1.5-flash" }
};

export function AiProviderSettings({ initialConfig }: { initialConfig: AiConfig }) {
  const [config, setConfig] = useState(initialConfig);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  async function save(formData: FormData) {
    setMessage("");
    setBusy("save");
    try {
      const response = await fetch("/api/ai/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: String(formData.get("provider") || "openai"),
          apiKey: String(formData.get("apiKey") || "").trim() || undefined,
          embeddingModel: String(formData.get("embeddingModel") || "").trim(),
          transcriptionModel: String(formData.get("transcriptionModel") || "").trim()
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(body.error || "AI-Konfiguration konnte nicht gespeichert werden.");
        return;
      }
      setConfig(body);
      setMessage("AI-Konfiguration gespeichert.");
    } finally {
      setBusy("");
    }
  }

  async function reindex() {
    setMessage("");
    setBusy("reindex");
    try {
      const response = await fetch("/api/search/reindex", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(body.error || "Reindex fehlgeschlagen.");
        return;
      }
      setMessage(`${body.indexed} von ${body.total} Dokumenten wurden in den Suchindex geschrieben.`);
    } finally {
      setBusy("");
    }
  }

  function providerChanged(provider: string) {
    const next = defaults[provider as keyof typeof defaults] || defaults.openai;
    setConfig((current) => ({ ...current, provider, ...next }));
  }

  return (
    <section className="rounded-lg border border-line bg-white">
      <div className="border-b border-line p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-bold">AI-Suche und Transkription</div>
            <p className="mt-1 text-sm text-muted">Provider fuer Embeddings und Telegram-Sprachnachrichten. Der API-Key wird verschluesselt gespeichert.</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${config.configured ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
            {config.configured ? "aktiv" : "API-Key fehlt"}
          </span>
        </div>
      </div>
      <form action={save} className="grid gap-3 p-4">
        <label className="grid gap-1 text-sm font-semibold">
          Dienst
          <select name="provider" value={config.provider} onChange={(event) => providerChanged(event.target.value)}>
            <option value="openai">OpenAI</option>
            <option value="gemini">Gemini</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          API-Key
          <input name="apiKey" type="password" placeholder={config.configured ? "leer lassen, um bestehenden Key zu behalten" : "API-Key eintragen"} />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Embedding-Modell
          <input name="embeddingModel" value={config.embeddingModel} onChange={(event) => setConfig((current) => ({ ...current, embeddingModel: event.target.value }))} />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Transkriptionsmodell
          <input name="transcriptionModel" value={config.transcriptionModel} onChange={(event) => setConfig((current) => ({ ...current, transcriptionModel: event.target.value }))} />
        </label>
        <button disabled={busy === "save"} type="submit">{busy === "save" ? "Speichere..." : "AI-Konfiguration speichern"}</button>
      </form>
      <div className="grid gap-3 border-t border-line p-4">
        <div className="text-sm">
          <div className="font-bold">Dokumentindex</div>
          <p className="mt-1 text-muted">Bestehende Dokumente in Qdrant importieren. Neue Uploads werden danach automatisch indexiert.</p>
        </div>
        <button className="button-secondary" disabled={busy === "reindex"} onClick={reindex} type="button">
          {busy === "reindex" ? "Indexiere..." : "Alle Dokumente neu indexieren"}
        </button>
      </div>
      {message ? <div className="border-t border-line p-4 text-sm font-semibold">{message}</div> : null}
    </section>
  );
}
