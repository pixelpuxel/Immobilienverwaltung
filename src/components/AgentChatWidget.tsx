"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type ChatMessage = {
  role: "user" | "assistant" | "status";
  content: string;
  lines?: string[];
  open?: boolean;
  artifacts?: AgentArtifact[];
};

type AgentArtifact = {
  type: "link" | "pdf" | "docx" | "document";
  label: string;
  url: string;
  thumbnailUrl?: string;
};

type StreamEvent = {
  type: "status" | "tool_start" | "tool_result" | "clarification" | "artifact" | "final" | "error";
  message?: string;
  summary?: string;
  answer?: string;
  conversationId?: string | null;
  steps?: string[];
  artifact?: AgentArtifact;
  artifacts?: AgentArtifact[];
};

export function AgentChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [statusLines, setStatusLines] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [, setCurrentArtifacts] = useState<AgentArtifact[]>([]);
  const [contextOpen, setContextOpen] = useState(false);
  const [debugContext, setDebugContext] = useState<unknown>(null);
  const [debugLoading, setDebugLoading] = useState(false);
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
  }, [messages, statusLines, open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    setCurrentArtifacts([]);
    let collectedArtifacts: AgentArtifact[] = [];
    const initialStatus = "Ich nehme den bisherigen Kontext auf.";
    setStatusLines([initialStatus]);
    setMessages((current) => [
      ...current,
      { role: "user", content: text },
      { role: "status", content: "Agent arbeitet", lines: [initialStatus], open: true }
    ]);
    try {
      const response = await fetch("/api/agent/chat?stream=1", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({
          message: text,
          conversationId: window.localStorage.getItem("portal_agent_conversation_id")
        })
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Agent-Anfrage fehlgeschlagen.");
      }
      await readEventStream(response.body, (event) => {
        if (event.type === "status" || event.type === "tool_start") {
          addStatus(event.message || "Ich arbeite daran.");
        } else if (event.type === "tool_result") {
          addStatus(event.summary || "Schritt erledigt.");
        } else if (event.type === "clarification") {
          addStatus("Rueckfrage erforderlich.");
          setMessages((current) => [
            ...current.map((message) => message.role === "status" && message.open ? { ...message, content: "Agent-Lauf", open: false } : message),
            { role: "assistant", content: event.message || "Ich brauche noch eine Praezisierung." }
          ]);
        } else if (event.type === "artifact" && event.artifact) {
          collectedArtifacts = mergeArtifacts(collectedArtifacts, [event.artifact as AgentArtifact]);
          setCurrentArtifacts(collectedArtifacts);
        } else if (event.type === "final") {
          addStatus("Antwort erstellt.");
          if (event.conversationId) window.localStorage.setItem("portal_agent_conversation_id", event.conversationId);
          const steps = event.steps?.length ? event.steps : ["Antwort erstellt."];
          const artifacts = mergeArtifacts(collectedArtifacts, event.artifacts || []);
          setMessages((current) => [
            ...ensureStatusMessage(current, steps).map((message) => message.role === "status" && message.open ? { ...message, content: "Agent-Lauf", open: false } : message),
            { role: "assistant", content: event.answer || "Keine Antwort erhalten.", artifacts }
          ]);
        } else if (event.type === "error") {
          addStatus("Fehler im Agent-Lauf.");
          setMessages((current) => [
            ...current.map((message) => message.role === "status" && message.open ? { ...message, content: "Agent-Lauf", open: false } : message),
            { role: "assistant", content: `Fehler: ${event.message || "Agent-Anfrage fehlgeschlagen."}` }
          ]);
        }
      });
    } catch (error) {
      addStatus("Fehler im Agent-Lauf.");
      setMessages((current) => [
        ...current.map((message) => message.role === "status" && message.open ? { ...message, content: "Agent-Lauf", open: false } : message),
        { role: "assistant", content: error instanceof Error ? `Fehler: ${error.message}` : "Fehler beim Agenten." }
      ]);
    } finally {
      setBusy(false);
    }
  }

  function addStatus(message: string) {
    setStatusLines((current) => [...current.slice(-5), message]);
    setMessages((current) => {
      const next = [...current];
      const index = [...next].reverse().findIndex((item) => item.role === "status");
      if (index === -1) return next;
      const realIndex = next.length - 1 - index;
      const status = next[realIndex];
      next[realIndex] = { ...status, lines: [...(status.lines || []), message].slice(-30) };
      return next;
    });
  }

  function ensureStatusMessage(current: ChatMessage[], lines: string[]) {
    if (current.some((message) => message.role === "status" && message.open)) return current;
    return [...current, { role: "status" as const, content: "Agent-Lauf", lines, open: false }];
  }

  async function resetContext() {
    if (busy) return;
    const conversationId = window.localStorage.getItem("portal_agent_conversation_id");
    await fetch(conversationId ? `/api/agent/chat?conversationId=${encodeURIComponent(conversationId)}` : "/api/agent/chat", { method: "DELETE" }).catch(() => undefined);
    window.localStorage.removeItem("portal_agent_conversation_id");
    setDebugContext(null);
    setContextOpen(false);
    setStatusLines([]);
    setMessages([{ role: "assistant", content: "Der Agent-Kontext wurde zurueckgesetzt. Wir starten frisch." }]);
  }

  async function loadContext() {
    const conversationId = window.localStorage.getItem("portal_agent_conversation_id");
    const url = conversationId ? `/api/agent/chat?conversationId=${encodeURIComponent(conversationId)}&includeDebug=1` : "/api/agent/chat?includeDebug=1";
    setContextOpen(true);
    setDebugLoading(true);
    try {
      const body = await fetch(url).then((response) => response.ok ? response.json() : Promise.reject());
      setDebugContext({ conversationId: body.conversationId, state: body.state, runLogs: body.runLogs });
    } catch {
      setDebugContext({ error: "Kontext konnte nicht geladen werden." });
    } finally {
      setDebugLoading(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 print:hidden">
      {open ? (
        <div
          className="mb-3 flex h-[520px] min-h-[420px] w-[min(420px,calc(100vw-2rem))] min-w-[320px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-line bg-white shadow-2xl"
          style={{ resize: "both" }}
        >
          <div className="flex items-center justify-between border-b border-line bg-[linear-gradient(135deg,#ecfdf5,#eef4ff)] px-4 py-3">
            <div>
              <div className="font-bold">Portal-Agent</div>
              <div className="text-xs text-muted">Web und Telegram teilen denselben Kontext.</div>
            </div>
            <div className="flex items-center gap-2">
              <button className="button-secondary px-3 py-1 text-sm" disabled={busy && !messages.length} onClick={loadContext} title="Gespeicherten Agent-Kontext und Debug-Log anzeigen" type="button">Kontext</button>
              <button className="button-secondary px-3 py-1 text-sm" disabled={busy} onClick={resetContext} title="Agent-Kontext und sichtbaren Verlauf zuruecksetzen" type="button">Reset</button>
              <button className="button-secondary px-3 py-1 text-sm" onClick={() => { window.localStorage.setItem("portal_agent_widget_open", "false"); setOpen(false); }} type="button">Schliessen</button>
            </div>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
            {contextOpen ? (
              <div className="rounded-lg border border-line bg-panel p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-bold">Gespeicherter Kontext</div>
                    <div className="text-xs text-muted">Conversation-State und letzte Agent-Runs aus dem Backend.</div>
                  </div>
                  <button className="button-secondary px-2 py-1 text-xs" type="button" onClick={() => setContextOpen(false)}>Ausblenden</button>
                </div>
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded border border-line bg-white p-2 text-[11px] leading-relaxed">
                  {debugLoading ? "Lade Kontext..." : JSON.stringify(debugContext, null, 2)}
                </pre>
              </div>
            ) : null}
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`rounded-lg px-3 py-2 ${message.role === "user" ? "ml-8 bg-accent text-white" : message.role === "status" ? "mr-8 border border-emerald-200 bg-emerald-50 text-emerald-950" : "mr-8 bg-panel"}`}>
                {message.role === "status" ? (
                  <details open={message.open}>
                    <summary className="cursor-pointer font-semibold">
                      {message.content}
                      {busy && message.open ? <span className="ml-2 inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-600 align-middle" /> : null}
                    </summary>
                    <div className="mt-2 space-y-1 text-xs text-emerald-900">
                      {(message.lines || []).map((line, lineIndex) => (
                        <div key={`${line}-${lineIndex}`} className="flex gap-2">
                          <span className="shrink-0 text-emerald-600">{lineIndex + 1}.</span>
                          <span>{line}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : (
                  <div className="whitespace-pre-wrap">{renderMessage(message.content)}</div>
                )}
                {message.artifacts?.length ? (
                  <div className="mt-3 grid gap-2">
                    {message.artifacts.map((artifact) => <ArtifactCard artifact={artifact} key={`${artifact.url}-${artifact.label}`} />)}
                  </div>
                ) : null}
              </div>
            ))}
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

async function readEventStream(stream: ReadableStream<Uint8Array>, onEvent: (event: StreamEvent) => void) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";
    for (const chunk of chunks) {
      const line = chunk.split("\n").find((item) => item.startsWith("data: "));
      if (!line) continue;
      try {
        onEvent(JSON.parse(line.slice(6)) as StreamEvent);
      } catch {
        // Ignore malformed stream fragments.
      }
    }
  }
}

function renderMessage(content: string) {
  const parts = content.split(/(https?:\/\/[^\s)]+|\/(?:api|properties|users|contracts|documents|tenant|search|map)[^\s)]*)/g);
  return parts.map((part, index) => {
    if (/^(https?:\/\/|\/)/.test(part)) {
      return <a key={`${part}-${index}`} className="font-semibold underline" href={part} target={part.startsWith("http") ? "_blank" : undefined} rel="noreferrer">{prettyLinkLabel(part)}</a>;
    }
    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function ArtifactCard({ artifact }: { artifact: AgentArtifact }) {
  const thumbnailUrl = artifact.thumbnailUrl || inferThumbnailUrl(artifact.url);
  return (
    <a className="flex items-center gap-3 rounded-md border border-line bg-white p-2 text-sm no-underline hover:border-accent/50" href={artifact.url} target={artifact.url.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
      {thumbnailUrl ? (
        <img alt="" className="h-14 w-14 shrink-0 rounded border border-line object-cover" src={thumbnailUrl} loading="lazy" />
      ) : (
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-emerald-50 text-xs font-black text-accent">{artifactIcon(artifact)}</span>
      )}
      <span className="min-w-0">
        <span className="block truncate font-bold text-ink">{artifact.label}</span>
        <span className="text-xs text-muted">{prettyLinkLabel(artifact.url)}</span>
      </span>
    </a>
  );
}

function inferThumbnailUrl(url: string) {
  const documentMatch = url.match(/\/api\/documents\/([^/]+)\/(?:preview|download)/);
  if (documentMatch) return `/api/documents/${documentMatch[1]}/thumbnail`;
  return "";
}

function artifactIcon(artifact: AgentArtifact) {
  if (artifact.type === "pdf") return "PDF";
  if (artifact.type === "docx") return "DOC";
  if (artifact.type === "document") return "DU";
  return "→";
}

function prettyLinkLabel(url: string) {
  if (/\/properties\/[^/?#]+/.test(url)) return "Immobilie öffnen";
  if (/\/users\?tenantId=/.test(url)) return "Mieter öffnen";
  if (/\/api\/documents\/[^/]+\/preview/.test(url)) return "Vorschau öffnen";
  if (/\/api\/documents\/[^/]+\/download/.test(url)) return "Dokument herunterladen";
  if (/\/api\/contracts\/[^/]+\/download/.test(url)) return url.includes("format=docx") ? "DOCX herunterladen" : "PDF herunterladen";
  return url;
}

function mergeArtifacts(current: AgentArtifact[], next: AgentArtifact[]) {
  const map = new Map<string, AgentArtifact>();
  [...current, ...next].forEach((artifact) => map.set(`${artifact.url}:${artifact.label}`, artifact));
  return Array.from(map.values()).slice(0, 12);
}
