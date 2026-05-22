"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type TemplateManagerProps = {
  template: {
    id: string;
    name: string;
    filename: string;
  };
};

export function TemplateManager({ template }: TemplateManagerProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const response = await fetch(`/api/templates/${template.id}`, {
      method: "PATCH",
      body: new FormData(event.currentTarget)
    });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Speichern fehlgeschlagen." }));
      setMessage(body.error || "Speichern fehlgeschlagen.");
      return;
    }
    setMessage("Gespeichert.");
    router.refresh();
  }

  async function remove() {
    if (!window.confirm("Diese Vertragsvorlage wirklich loeschen? Bereits erzeugte Verträge bleiben erhalten.")) return;
    setBusy(true);
    const response = await fetch(`/api/templates/${template.id}`, { method: "DELETE" });
    setBusy(false);
    if (response.ok) router.refresh();
  }

  return (
    <div className="grid gap-3 rounded-md bg-panel p-3 text-sm">
      <div>
        <div className="font-semibold">{template.name}</div>
        <div className="text-muted">{template.filename}</div>
      </div>
      {message ? <div className="rounded-md border border-line bg-white p-2 text-xs">{message}</div> : null}
      <div className="grid gap-2 sm:grid-cols-3">
        <a className="button-secondary text-center" href={`/api/templates/${template.id}/preview`} target="_blank" rel="noreferrer">Vorschau</a>
        <a className="button-secondary text-center" href={`/api/templates/${template.id}/download`}>Download</a>
        <button className="button-secondary" disabled={busy} type="button" onClick={remove}>Loeschen</button>
      </div>
      <form className="grid gap-2" onSubmit={save}>
        <label>Name<input name="name" defaultValue={template.name} required /></label>
        <label className="grid gap-1 text-xs font-semibold text-muted">
          Neue DOCX-Version
          <input name="file" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
        </label>
        <button disabled={busy} type="submit">{busy ? "Speichere..." : "Speichern"}</button>
      </form>
    </div>
  );
}
