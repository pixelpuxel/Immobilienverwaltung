"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export function AgentChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setOpen(window.localStorage.getItem("portal_agent_widget_open") === "true");
    const storedId = window.localStorage.getItem("portal_agent_conversation_id");
    const url = storedId ? `/api/agent/chat?conversationId=${encodeURIComponent(storedId)}` : "/api/agent/chat";
    fetch(url)
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((body) => {
        if (body.conversationId) window.localStorage.setItem("portal_agent_conversation_id", body.conversationId);
        const loaded = Array.isArray(body.messages) ? body.messages.filter((message: ChatMessage) => message.role === "user" || message.role === "assistant") : [];
        setMessages(loaded.length ? loaded : [{ role: "assistant", content: "Hallo. Ich kann im Portal suchen, Funktionen erklären und fachliche Aktionen ausführen." }]);
      })
      .catch(() => setMessages([{ role: "assistant", content: "Hallo. Ich kann im Portal suchen, Funktionen erklären und fachliche Aktionen ausführen." }]));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    setMessages((current) => [...current, { role: "user", content: text }]);
    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          conversationId: window.localStorage.getItem("portal_agent_conversation_id")
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Agent-Anfrage fehlgeschlagen.");
      if (body.conversationId) window.localStorage.setItem("portal_agent_conversation_id", body.conversationId);
      setMessages((current) => [...current, { role: "assistant", content: body.answer || "Keine Antwort erhalten." }]);
    } catch (error) {
      setMessages((current) => [...current, { role: "assistant", content: error instanceof Error ? `Fehler: ${error.message}` : "Fehler beim Agenten." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 print:hidden">
      {open ? (
        <div className="mb-3 flex h-[520px] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-line bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-line bg-[linear-gradient(135deg,#ecfdf5,#eef4ff)] px-4 py-3">
            <div>
              <div className="font-bold">Portal-Agent</div>
              <div className="text-xs text-muted">Web und Telegram teilen denselben Kontext.</div>
            </div>
            <button className="button-secondary px-3 py-1 text-sm" onClick={() => { window.localStorage.setItem("portal_agent_widget_open", "false"); setOpen(false); }} type="button">Schliessen</button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`rounded-lg px-3 py-2 ${message.role === "user" ? "ml-8 bg-accent text-white" : "mr-8 bg-panel"}`}>
                <div className="whitespace-pre-wrap">{renderMessage(message.content)}</div>
              </div>
            ))}
            {busy ? <div className="mr-8 rounded-lg bg-panel px-3 py-2 text-muted">Denke nach...</div> : null}
            <div ref={endRef} />
          </div>
          <form className="flex gap-2 border-t border-line p-3" onSubmit={submit}>
            <input aria-label="Nachricht an Portal-Agent" className="min-w-0 flex-1" onChange={(event) => setInput(event.target.value)} placeholder="Frage oder Aktion eingeben..." value={input} />
            <button disabled={busy} type="submit">Senden</button>
          </form>
        </div>
      ) : null}
      <button className="rounded-full bg-accent px-5 py-3 font-bold text-white shadow-xl" onClick={() => setOpen((value) => {
        const next = !value;
        window.localStorage.setItem("portal_agent_widget_open", String(next));
        return next;
      })} type="button">
        Agent
      </button>
    </div>
  );
}

function renderMessage(content: string) {
  const parts = content.split(/(https?:\/\/[^\s)]+|\/(?:api|properties|users|contracts|documents|tenant|search|map)[^\s)]*)/g);
  return parts.map((part, index) => {
    if (/^(https?:\/\/|\/)/.test(part)) {
      return <a key={`${part}-${index}`} className="font-semibold underline" href={part} target={part.startsWith("http") ? "_blank" : undefined} rel="noreferrer">{part}</a>;
    }
    return <span key={`${part}-${index}`}>{part}</span>;
  });
}
