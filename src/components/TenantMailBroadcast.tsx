"use client";

import { useMemo, useState } from "react";

type TemplateOption = {
  id: string;
  name: string;
  subject: string;
  text: string;
  placeholders: string[];
};

type RecipientOption = {
  id: string;
  name: string;
  email: string;
  unitLabel: string;
};

export function TenantMailBroadcast({ templates, recipients }: { templates: TemplateOption[]; recipients: RecipientOption[] }) {
  const [selectedTemplateId, setSelectedTemplateId] = useState(templates[0]?.id || "");
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const selectedTemplate = useMemo(() => templates.find((template) => template.id === selectedTemplateId), [selectedTemplateId, templates]);

  async function sendBroadcast(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/mail/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId: selectedTemplateId, tenantUserIds: selectedRecipients })
    }).catch(() => null);
    if (!response) {
      setMessage("Versand fehlgeschlagen: Portal nicht erreichbar.");
      return;
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(body.error || "Rundmail konnte nicht versendet werden.");
      return;
    }
    const sent = body.results?.filter((item: { sent: boolean }) => item.sent).length || 0;
    const skipped = body.results?.length - sent || 0;
    setMessage(`${sent} Mail(s) versendet${skipped ? `, ${skipped} uebersprungen/fehlgeschlagen` : ""}.`);
  }

  function toggleRecipient(id: string) {
    setSelectedRecipients((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  return (
    <section className="grid gap-4">
      <form className="grid gap-4" onSubmit={sendBroadcast}>
        <label>
          Vorlage
          <select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.currentTarget.value)}>
            {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
          </select>
        </label>
        {selectedTemplate ? (
          <div className="rounded-lg border border-line bg-panel p-3 text-sm">
            <div className="font-bold">{selectedTemplate.subject}</div>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-muted">{selectedTemplate.text}</pre>
            <div className="mt-2 flex flex-wrap gap-2">
              {selectedTemplate.placeholders.map((placeholder) => (
                <code className="rounded-md bg-white px-2 py-1 text-xs font-bold text-teal-900" key={placeholder}>{`{{${placeholder}}}`}</code>
              ))}
            </div>
          </div>
        ) : null}
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-bold">Empfaenger</div>
            <button
              className="button-secondary px-3 py-2 text-sm"
              onClick={() => setSelectedRecipients(selectedRecipients.length === recipients.length ? [] : recipients.map((recipient) => recipient.id))}
              type="button"
            >
              {selectedRecipients.length === recipients.length ? "Alle abwaehlen" : "Alle Mieter auswaehlen"}
            </button>
          </div>
          <div className="max-h-80 overflow-auto rounded-lg border border-line bg-white">
            {recipients.length ? recipients.map((recipient) => (
              <label className="grid cursor-pointer gap-1 border-b border-line p-3 text-sm last:border-b-0 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start" key={recipient.id}>
                <input
                  checked={selectedRecipients.includes(recipient.id)}
                  onChange={() => toggleRecipient(recipient.id)}
                  type="checkbox"
                />
                <span>
                  <span className="block font-semibold">{recipient.name}</span>
                  <span className="block text-muted">{recipient.email} · {recipient.unitLabel}</span>
                </span>
              </label>
            )) : <div className="p-3 text-sm text-muted">Keine Mieter vorhanden.</div>}
          </div>
        </div>
        {message ? <div className="rounded-md border border-line bg-panel p-3 text-sm">{message}</div> : null}
        <button disabled={!selectedTemplateId || selectedRecipients.length === 0} type="submit">Rundmail senden</button>
      </form>
    </section>
  );
}
