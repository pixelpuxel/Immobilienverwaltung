"use client";

import { useMemo, useState } from "react";

type MailTemplateItem = {
  id: string;
  key: string;
  name: string;
  description: string;
  trigger: string;
  subject: string;
  text: string;
  placeholders: string[];
  active: boolean;
  preview: {
    subject: string;
    text: string;
  };
};

export function MailTemplateManager({ initialTemplates }: { initialTemplates: MailTemplateItem[] }) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [message, setMessage] = useState("");

  async function updateTemplate(template: MailTemplateItem, event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/mail/templates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: template.id,
        subject: String(form.get("subject") || ""),
        text: String(form.get("text") || ""),
        active: form.get("active") === "on"
      })
    }).catch(() => null);
    if (!response) {
      setMessage("Speichern fehlgeschlagen: Portal nicht erreichbar.");
      return;
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(body.error || "Template konnte nicht gespeichert werden.");
      return;
    }
    setTemplates((current) => current.map((item) => (item.id === body.id ? body : item)));
    setMessage("Mail-Template gespeichert.");
  }

  return (
    <section className="rounded-lg border border-line bg-white shadow-sm">
      <div className="border-b border-line p-4">
        <h2 className="text-xl font-bold">Mail-Templates</h2>
        <p className="mt-1 text-sm text-muted">
          Hier steuerst du die Texte fuer automatische Portal-Mails. Platzhalter wie {"{{name}}"} werden beim Versand ersetzt.
        </p>
      </div>
      {message ? <div className="m-4 rounded-md border border-line bg-panel p-3 text-sm">{message}</div> : null}
      <div className="divide-y divide-line">
        {templates.map((template, index) => (
          <TemplateEditor key={template.id} template={template} defaultOpen={index < 2} onSubmit={updateTemplate} />
        ))}
      </div>
    </section>
  );
}

function TemplateEditor({
  template,
  defaultOpen,
  onSubmit
}: {
  template: MailTemplateItem;
  defaultOpen: boolean;
  onSubmit: (template: MailTemplateItem, event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const renderedPlaceholders = useMemo(() => template.placeholders.map((placeholder) => `{{${placeholder}}}`), [template.placeholders]);

  return (
    <details className="group" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 p-4 hover:bg-panel">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-teal-50 px-2 py-1 text-xs font-bold text-teal-800">{template.active ? "aktiv" : "pausiert"}</span>
            <h3 className="font-bold">{template.name}</h3>
          </div>
          <p className="mt-1 text-sm text-muted">{template.description}</p>
        </div>
        <span className="rounded-md border border-line px-3 py-2 text-sm font-bold group-open:bg-ink group-open:text-white">Bearbeiten</span>
      </summary>
      <div className="grid gap-4 p-4 pt-0 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form className="grid gap-3 rounded-lg bg-panel p-4" onSubmit={(event) => onSubmit(template, event)}>
          <div className="rounded-md border border-line bg-white p-3 text-sm">
            <div className="font-bold">Wann wird diese Mail verschickt?</div>
            <p className="mt-1 text-muted">{template.trigger}</p>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input name="active" type="checkbox" defaultChecked={template.active} />
            Automatischen Versand fuer diesen Anlass aktivieren
          </label>
          <label>
            Betreff
            <input name="subject" defaultValue={template.subject} />
          </label>
          <label>
            Mailtext
            <textarea name="text" rows={9} defaultValue={template.text} />
          </label>
          <button type="submit">Template speichern</button>
        </form>
        <aside className="grid gap-3 self-start">
          <div className="rounded-lg border border-line p-3">
            <div className="text-sm font-bold">Platzhalter</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {renderedPlaceholders.map((placeholder) => (
                <code className="rounded-md bg-teal-50 px-2 py-1 text-xs font-bold text-teal-900" key={placeholder}>{placeholder}</code>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-line p-3">
            <div className="text-sm font-bold">Vorschau mit Beispieldaten</div>
            <div className="mt-3 rounded-md bg-panel p-3">
              <div className="text-xs font-bold uppercase text-muted">Betreff</div>
              <div className="mt-1 font-semibold">{template.preview.subject}</div>
            </div>
            <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-panel p-3 text-sm">{template.preview.text}</pre>
          </div>
        </aside>
      </div>
    </details>
  );
}
