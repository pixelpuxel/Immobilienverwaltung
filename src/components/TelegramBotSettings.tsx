"use client";

import { useState } from "react";

type TelegramConfigState = {
  configured: boolean;
  botUsername?: string | null;
  chatId?: string | null;
  chatTitle?: string | null;
  threadId?: string | null;
  threadTitle?: string | null;
  pendingChatId?: string | null;
  pendingChatTitle?: string | null;
  pendingThreadId?: string | null;
  pendingThreadTitle?: string | null;
  pendingFrom?: string | null;
  pendingText?: string | null;
  pendingAt?: string | null;
  webhookEnabled?: boolean;
};

export function TelegramBotSettings({ initialConfig }: { initialConfig: TelegramConfigState }) {
  const [config, setConfig] = useState(initialConfig);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  async function saveToken(formData: FormData) {
    setMessage("");
    setBusy("token");
    const token = String(formData.get("token") || "").trim();
    try {
      const response = await fetch("/api/telegram/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(body.error || "Telegram-Token konnte nicht gespeichert werden.");
        return;
      }
      setConfig(body);
      setMessage("Bot-Token gespeichert und validiert.");
    } finally {
      setBusy("");
    }
  }

  async function pollUpdates() {
    setMessage("");
    setBusy("poll");
    try {
      const response = await fetch("/api/telegram/updates", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(body.error || "Keine Bot-Nachricht gefunden.");
        return;
      }
      setConfig((current) => ({ ...current, ...body }));
      setMessage(body.count ? `${body.count} Telegram-Update(s) verarbeitet.` : "Keine neue Nachricht gefunden. Sende dem Bot zuerst eine Nachricht im Zielchat.");
    } finally {
      setBusy("");
    }
  }

  async function applyChat() {
    setMessage("");
    setBusy("apply");
    try {
      const response = await fetch("/api/telegram/apply-chat", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(body.error || "Chatdaten konnten nicht uebernommen werden.");
        return;
      }
      setConfig((current) => ({ ...current, ...body }));
      setMessage("Chat und Thread wurden uebernommen.");
    } finally {
      setBusy("");
    }
  }

  async function setWebhook(enabled: boolean) {
    setMessage("");
    setBusy("webhook");
    try {
      const response = await fetch("/api/telegram/webhook", { method: enabled ? "POST" : "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(body.error || "Webhook konnte nicht geaendert werden.");
        return;
      }
      setConfig((current) => ({ ...current, webhookEnabled: enabled }));
      setMessage(enabled ? "Webhook ist aktiv." : "Webhook ist deaktiviert.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="rounded-lg border border-line bg-white">
      <div className="border-b border-line p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-bold">Telegram-Bot</div>
            <p className="mt-1 text-sm text-muted">Portal-Funktionen per Telegram abrufen. Token wird verschluesselt gespeichert und nicht wieder angezeigt.</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${config.configured ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
            {config.configured ? "konfiguriert" : "nicht eingerichtet"}
          </span>
        </div>
      </div>

      <form action={saveToken} className="grid gap-3 p-4">
        <label className="grid gap-1 text-sm font-semibold">
          Bot-Token
          <input name="token" placeholder={config.configured ? "Neuen Token eintragen, falls geaendert" : "Token von BotFather"} type="password" required />
        </label>
        <button disabled={busy === "token"} type="submit">{busy === "token" ? "Pruefe..." : "Token speichern"}</button>
      </form>

      <div className="grid gap-3 border-t border-line p-4 text-sm">
        <Info label="Bot" value={config.botUsername ? `@${config.botUsername}` : "noch nicht bekannt"} />
        <Info label="Aktiver Chat" value={config.chatTitle ? `${config.chatTitle} (${config.chatId})` : "noch nicht uebernommen"} />
        <Info label="Aktiver Thread" value={config.threadId ? `${config.threadTitle || "Thread"} (${config.threadId})` : "kein Thread hinterlegt"} />
        <Info label="Webhook" value={config.webhookEnabled ? "aktiv" : "inaktiv"} />
      </div>

      <div className="grid gap-3 border-t border-line p-4">
        <div className="text-sm">
          <div className="font-bold">Chat-ID und Thread-ID automatisch finden</div>
          <p className="mt-1 text-muted">Schreibe dem Bot im gewuenschten Chat oder Thread eine Nachricht, z.B. <code>/hilfe</code>. Danach hier auslesen und uebernehmen.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="button-secondary" disabled={!config.configured || busy === "poll"} onClick={pollUpdates} type="button">
            {busy === "poll" ? "Lese..." : "Letzte Bot-Nachricht auslesen"}
          </button>
          <button disabled={!config.pendingChatId || busy === "apply"} onClick={applyChat} type="button">
            {busy === "apply" ? "Uebernehme..." : "Diese Daten uebernehmen"}
          </button>
        </div>
        {config.pendingChatId ? (
          <div className="rounded-md border border-line bg-panel p-3 text-sm">
            <div className="font-bold">Erkannte Nachricht</div>
            <div className="mt-2 grid gap-1 text-muted">
              <div><strong className="text-fg">Chat:</strong> {config.pendingChatTitle || "unbekannt"} ({config.pendingChatId})</div>
              <div><strong className="text-fg">Thread:</strong> {config.pendingThreadId || "keiner"}</div>
              <div><strong className="text-fg">Von:</strong> {config.pendingFrom || "unbekannt"}</div>
              <div><strong className="text-fg">Text:</strong> {config.pendingText || "-"}</div>
              <div><strong className="text-fg">Zeit:</strong> {config.pendingAt ? formatDate(config.pendingAt) : "-"}</div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 border-t border-line p-4">
        <div className="text-sm">
          <div className="font-bold">Webhook</div>
          <p className="mt-1 text-muted">Aktivieren, damit Telegram neue Nachrichten direkt ans Portal liefert. Voraussetzung: APP_URL ist von Telegram per HTTPS erreichbar.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button disabled={!config.configured || busy === "webhook"} onClick={() => setWebhook(true)} type="button">Webhook aktivieren</button>
          <button className="button-secondary" disabled={!config.configured || busy === "webhook"} onClick={() => setWebhook(false)} type="button">Webhook deaktivieren</button>
        </div>
      </div>

      {message ? <div className="border-t border-line p-4 text-sm font-semibold">{message}</div> : null}
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md bg-panel px-3 py-2">
      <span className="font-semibold text-muted">{label}</span>
      <span className="break-all text-right">{value}</span>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
