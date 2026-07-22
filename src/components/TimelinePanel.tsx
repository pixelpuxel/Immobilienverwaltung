"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { TIMELINE_EVENT_TYPES, TIMELINE_STATUS, type TimelineItem } from "@/lib/timeline";

type Option = { id: string; label: string; unitId?: string | null };

export function TimelinePanel({
  propertyId,
  canEdit,
  initialItems,
  units,
  tenants,
  documents
}: {
  propertyId: string;
  canEdit: boolean;
  initialItems: TimelineItem[];
  units: Option[];
  tenants: Option[];
  documents: Option[];
}) {
  const [items, setItems] = useState(initialItems);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const monthlyBars = useMemo(() => monthBuckets(items), [items]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const selectedDocuments = form.getAll("documentIds").map(String).filter(Boolean);
    const payload = {
      propertyId,
      unitId: String(form.get("unitId") || "") || null,
      tenantProfileId: String(form.get("tenantProfileId") || "") || null,
      eventType: String(form.get("eventType") || "NOTE"),
      title: String(form.get("title") || "").trim(),
      description: String(form.get("description") || "").trim() || null,
      status: String(form.get("status") || "INFO"),
      eventDate: String(form.get("eventDate") || ""),
      dueDate: String(form.get("dueDate") || "") || null,
      endDate: String(form.get("endDate") || "") || null,
      costAmount: String(form.get("costAmount") || "") || null,
      costCategory: String(form.get("costCategory") || "").trim() || null,
      isInternal: form.get("isInternal") === "on",
      documentIds: selectedDocuments
    };
    const response = await fetch("/api/timeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => null);
    setBusy(false);
    if (!response) {
      setMessage("Timeline konnte nicht gespeichert werden.");
      return;
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(body.error || "Timeline konnte nicht gespeichert werden.");
      return;
    }
    setItems((current) => [body, ...current].sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime()));
    event.currentTarget.reset();
    setMessage("Ereignis gespeichert.");
  }

  return (
    <section id="timeline" className="scroll-mt-24 rounded-lg border border-line bg-white">
      <div className="border-b border-line bg-gradient-to-r from-emerald-50 via-sky-50 to-white p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div>
            <div className="text-xs font-bold uppercase text-accent">Objektverlauf</div>
            <h2 className="mt-1 text-2xl font-bold">Timeline</h2>
            <p className="mt-1 text-sm text-muted">Chronik fuer Mieterwechsel, Schaeden, Kosten, Kautionen, Mieten, Renovierungen und Belege.</p>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-muted">{items.length} Ereignisse</span>
        </div>
        {monthlyBars.length ? (
          <div className="mt-4 grid grid-cols-12 gap-1" aria-label="Timeline-Miniatur">
            {monthlyBars.map((bucket) => (
              <div key={bucket.month} className="grid gap-1">
                <div className="flex h-16 items-end rounded bg-white/70 px-1">
                  <div className="w-full rounded-t bg-accent" style={{ height: `${Math.max(10, bucket.percent)}%` }} />
                </div>
                <div className="text-center text-[10px] font-semibold text-muted">{bucket.month}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {canEdit ? (
        <details className="border-b border-line bg-panel">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-bold text-accent [&::-webkit-details-marker]:hidden">+ Ereignis erfassen</summary>
          <form className="grid gap-3 border-t border-line p-4 sm:grid-cols-2" onSubmit={submit}>
            {message ? <div className="rounded-md bg-white p-3 text-sm text-muted sm:col-span-2">{message}</div> : null}
            <label>Titel <span className="text-accent">*</span><input name="title" required placeholder="z. B. Heizungsausfall gemeldet" /></label>
            <label>Datum <span className="text-accent">*</span><input name="eventDate" required type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label>
            <label>Typ<select name="eventType" defaultValue="NOTE">{TIMELINE_EVENT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
            <label>Status<select name="status" defaultValue="INFO">{TIMELINE_STATUS.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
            <label>Einheit<select name="unitId" defaultValue=""><option value="">Gesamtes Objekt</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}</select></label>
            <label>Mieter<select name="tenantProfileId" defaultValue=""><option value="">Kein Mieterbezug</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.label}</option>)}</select></label>
            <label>Faelligkeit<input name="dueDate" type="date" /></label>
            <label>Ende / erledigt am<input name="endDate" type="date" /></label>
            <label>Kostenbetrag<input name="costAmount" step="0.01" type="number" placeholder="z. B. 420.00" /></label>
            <label>Kostenart<input name="costCategory" placeholder="z. B. Handwerker, Hausgeld" /></label>
            <label className="sm:col-span-2">Beschreibung<textarea className="min-h-24" name="description" placeholder="Kurz beschreiben, was passiert ist und was noch offen ist." /></label>
            <label className="sm:col-span-2">Dokumente verknuepfen<select className="min-h-32" multiple name="documentIds">{documents.map((document) => <option key={document.id} value={document.id}>{document.label}</option>)}</select></label>
            <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2"><input name="isInternal" type="checkbox" /> Internes Ereignis / Kosten nur fuer Eigentuemer</label>
            <button disabled={busy} className="sm:col-span-2" type="submit">{busy ? "Speichert..." : "Ereignis speichern"}</button>
          </form>
        </details>
      ) : null}

      <div className="divide-y divide-line">
        {items.length ? items.map((item) => <TimelineRow key={item.id} item={item} />) : (
          <div className="p-4 text-sm text-muted">Noch keine Ereignisse vorhanden.</div>
        )}
      </div>
    </section>
  );
}

function TimelineRow({ item }: { item: TimelineItem }) {
  const tone = TIMELINE_EVENT_TYPES.find((type) => type.value === item.eventType)?.tone || "bg-panel text-muted";
  return (
    <article id={`timeline-${item.id}`} className="scroll-mt-24 grid gap-3 p-4 sm:grid-cols-[130px_1fr]">
      <div>
        <div className="text-sm font-bold">{formatDate(item.eventDate)}</div>
        <div className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs font-bold ${tone}`}>{item.eventTypeLabel}</div>
      </div>
      <div className="min-w-0">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <h3 className="font-bold">{item.href ? <Link className="text-accent hover:underline" href={item.href}>{item.title}</Link> : item.title}</h3>
          <span className="text-xs font-semibold text-muted">{item.source === "timeline" ? "manuell" : "automatisch"}</span>
        </div>
        {item.description ? <p className="mt-1 text-sm text-muted">{item.description}</p> : null}
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
          {item.unit ? <span className="rounded-full bg-panel px-2 py-1">Einheit: {item.unit.unitNumber}</span> : null}
          {item.tenantProfile ? <Link className="rounded-full bg-panel px-2 py-1 hover:text-accent" href={`/users?tenantId=${item.tenantProfile.id}`}>Mieter: {item.tenantProfile.firstName} {item.tenantProfile.lastName}</Link> : null}
          {item.status ? <span className="rounded-full bg-panel px-2 py-1">Status: {item.status}</span> : null}
          {item.costAmount ? <span className="rounded-full bg-panel px-2 py-1">Kosten: {formatCurrency(Number(item.costAmount))}{item.costCategory ? ` (${item.costCategory})` : ""}</span> : null}
          {item.isInternal ? <span className="rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-800">intern</span> : null}
        </div>
        {item.documents.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {item.documents.map((document) => (
              <Link key={document.id} className="rounded-md border border-line bg-panel px-3 py-2 text-xs font-semibold hover:border-accent" href={`/documents?documentId=${document.id}`}>
                {document.title}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function monthBuckets(items: TimelineItem[]) {
  const formatter = new Intl.DateTimeFormat("de-DE", { month: "short" });
  const counts = Array.from({ length: 12 }, (_, index) => ({ month: formatter.format(new Date(2026, index, 1)).replace(".", ""), count: 0, percent: 0 }));
  for (const item of items) counts[new Date(item.eventDate).getMonth()].count += 1;
  const max = Math.max(1, ...counts.map((item) => item.count));
  return counts.map((item) => ({ ...item, percent: Math.round((item.count / max) * 100) }));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-DE").format(new Date(value));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value || 0);
}
