"use client";

import { useEffect, useState } from "react";

export type DocumentExportItem = {
  id: string;
  name: string;
  description: string | null;
  downloadedAt: string | null;
  items: Array<{ id: string; title: string; filename: string }>;
};

const STORAGE_KEY = "portal_active_document_export";
const EVENT_NAME = "portal-document-export-changed";

export function notifyDocumentExportChanged() {
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function getActiveDocumentExportId() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(STORAGE_KEY) || "";
}

export function DocumentExportManager({ initialExports }: { initialExports: DocumentExportItem[] }) {
  const [exports, setExports] = useState(initialExports);
  const [activeId, setActiveId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const stored = getActiveDocumentExportId();
    if (stored && initialExports.some((item) => item.id === stored)) setActiveId(stored);
  }, [initialExports]);

  function activate(id: string) {
    setActiveId(id);
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
    notifyDocumentExportChanged();
  }

  async function reload() {
    const response = await fetch("/api/document-exports");
    if (!response.ok) return;
    const body = await response.json();
    setExports(body);
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setBusy("create");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/document-exports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(form.get("name") || ""),
        description: String(form.get("description") || "")
      })
    });
    setBusy(null);
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Export konnte nicht angelegt werden." }));
      setMessage(body.error || "Export konnte nicht angelegt werden.");
      return;
    }
    const body = await response.json();
    event.currentTarget.reset();
    await reload();
    activate(body.id);
    setMessage("Export angelegt und aktiviert.");
  }

  async function remove(id: string) {
    if (!window.confirm("Export wirklich löschen? Die Dokumente selbst bleiben erhalten.")) return;
    setBusy(id);
    const response = await fetch(`/api/document-exports/${id}`, { method: "DELETE" });
    setBusy(null);
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Export konnte nicht geloescht werden." }));
      setMessage(body.error || "Export konnte nicht geloescht werden.");
      return;
    }
    if (activeId === id) activate("");
    await reload();
    setMessage("Export geloescht.");
  }

  async function removeDocument(exportId: string, documentId: string) {
    setMessage("");
    setBusy(`${exportId}:${documentId}`);
    const response = await fetch(`/api/document-exports/${exportId}/items`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId })
    });
    setBusy(null);
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Dokument konnte nicht entfernt werden." }));
      setMessage(body.error || "Dokument konnte nicht entfernt werden.");
      return;
    }
    await reload();
    setMessage("Dokument aus Export entfernt.");
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-4 shadow-sm">
      <div>
        <h2 className="text-xl font-bold">Dokumentenexport</h2>
        <p className="mt-1 text-sm text-muted">Dokumente portalweit sammeln und als ZIP mit README herunterladen.</p>
      </div>
      {message ? <div className="rounded-md border border-line bg-panel p-3 text-sm">{message}</div> : null}
      <form className="grid gap-3 rounded-md border border-line bg-panel p-3" onSubmit={create}>
        <label>Name<input name="name" required /></label>
        <label>Beschreibung<textarea name="description" /></label>
        <button disabled={busy === "create"} type="submit">{busy === "create" ? "Export wird angelegt..." : "Export anlegen und aktivieren"}</button>
      </form>
      <div className="grid gap-2">
        {exports.map((item) => (
          <div className={`rounded-md border p-3 text-sm ${item.id === activeId ? "border-accent bg-emerald-50" : "border-line bg-panel"}`} key={item.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-bold">{item.name}</div>
                {item.description ? <div className="mt-1 text-muted">{item.description}</div> : null}
                <div className="mt-1 text-xs text-muted">{item.items.length} Dokument(e){item.downloadedAt ? " · bereits heruntergeladen" : ""}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="button-secondary px-3 py-2 text-sm" type="button" onClick={() => activate(item.id)}>{item.id === activeId ? "Aktiv" : "Aktivieren"}</button>
                <a className={`button px-3 py-2 text-sm ${item.items.length ? "" : "pointer-events-none opacity-50"}`} href={`/api/document-exports/${item.id}/download`}>ZIP laden</a>
                <button className="button-secondary px-3 py-2 text-sm" disabled={busy === item.id} type="button" onClick={() => remove(item.id)}>Loeschen</button>
              </div>
            </div>
            {item.items.length ? (
              <div className="mt-3 grid gap-2">
                <div className="text-xs font-bold uppercase text-muted">Enthaltene Dokumente</div>
                {item.items.map((document) => (
                  <div className="grid gap-2 rounded-md border border-line bg-white p-2 text-xs sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" key={document.id}>
                    <div className="min-w-0">
                      <a className="block truncate font-semibold text-accent hover:underline" href={`/api/documents/${document.id}/preview`} target="_blank" rel="noreferrer">
                        {document.title}
                      </a>
                      <div className="truncate text-muted">{document.filename}</div>
                    </div>
                    <button
                      className="button-secondary px-3 py-2 text-xs"
                      disabled={busy === `${item.id}:${document.id}`}
                      onClick={() => removeDocument(item.id, document.id)}
                      type="button"
                    >
                      {busy === `${item.id}:${document.id}` ? "Entferne..." : "Entfernen"}
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {exports.length ? <button className="button-secondary justify-self-start px-3 py-2 text-sm" type="button" onClick={() => activate("")}>Keinen Export aktivieren</button> : null}
        {!exports.length ? <div className="rounded-md border border-dashed border-line p-3 text-sm text-muted">Noch kein Export angelegt.</div> : null}
      </div>
    </section>
  );
}

export function DocumentExportAddButton({ documentId }: { documentId: string }) {
  const [activeId, setActiveId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function sync() {
      setActiveId(getActiveDocumentExportId());
    }
    sync();
    window.addEventListener(EVENT_NAME, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT_NAME, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  async function add() {
    if (!activeId) return;
    setBusy(true);
    setMessage("");
    const response = await fetch(`/api/document-exports/${activeId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId })
    });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Dokument konnte nicht hinzugefuegt werden." }));
      setMessage(body.error || "Dokument konnte nicht hinzugefuegt werden.");
      return;
    }
    setMessage("Zum Export hinzugefuegt.");
  }

  if (!activeId) return null;
  return (
    <span className="inline-grid gap-1">
      <button className="button-secondary px-3 py-2 text-sm" disabled={busy} onClick={add} type="button">
        {busy ? "Fuege hinzu..." : "Zum Export hinzufuegen"}
      </button>
      {message ? <span className="text-xs text-muted">{message}</span> : null}
    </span>
  );
}
