"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Statement = {
  id: string;
  version: number;
  status: string;
  checksum: string;
  createdAt: string;
  finalizedAt: string | null;
  tenants: Array<{ id: string; name: string }>;
};

export function ServiceChargeStatementVersions({
  propertyId,
  year,
  statements,
  canCreate,
  missingRuleMessage
}: {
  propertyId: string;
  year: number;
  statements: Statement[];
  canCreate: boolean;
  missingRuleMessage?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  async function create() {
    if (!canCreate) {
      setMessage(missingRuleMessage || "Zuerst Verteilerschluessel speichern.");
      return;
    }
    setBusy("create");
    setMessage("");
    const response = await fetch("/api/service-charge-statements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId, year })
    });
    const body = await response.json().catch(() => ({}));
    setBusy("");
    setMessage(response.ok ? `Entwurf Version ${body.version} gespeichert.` : body.error || "Abrechnung konnte nicht gespeichert werden.");
    if (response.ok) router.refresh();
  }

  async function finalize(id: string) {
    setBusy(id);
    const response = await fetch(`/api/service-charge-statements/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "FINAL" })
    });
    const body = await response.json().catch(() => ({}));
    setBusy("");
    setMessage(response.ok ? "Abrechnung festgeschrieben." : body.error || "Festschreiben fehlgeschlagen.");
    if (response.ok) router.refresh();
  }

  async function remove(id: string) {
    setBusy(id);
    const response = await fetch(`/api/service-charge-statements/${id}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({}));
    setBusy("");
    setMessage(response.ok ? "Entwurf ausgeblendet." : body.error || "Loeschen fehlgeschlagen.");
    if (response.ok) router.refresh();
  }

  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
        <div>
          <div className="text-sm font-bold uppercase text-accent">Versionierte Abrechnung</div>
          <h2 className="mt-1 text-xl font-bold">Pruefen, speichern und drucken</h2>
          <p className="mt-1 text-sm text-muted">Jede Version friert Daten, Verteilung und Pruefsumme ein. Festgeschriebene Versionen bleiben unveraendert.</p>
        </div>
        <button disabled={Boolean(busy)} onClick={create} type="button">{busy === "create" ? "Erzeuge..." : canCreate ? "Neue Abrechnungsversion" : "Verteilerschluessel fehlt"}</button>
      </div>
      {!canCreate ? (
        <div className="border-b border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <div className="font-bold">PDF-Erzeugung ist vorbereitet.</div>
          <p className="mt-1">{missingRuleMessage || "Speichere zuerst den Verteilerschluessel fuer diese Immobilie und dieses Jahr. Danach kannst du hier eine Abrechnungsversion erzeugen und als PDF oeffnen."}</p>
        </div>
      ) : null}
      {message ? <div className="border-b border-line bg-panel p-3 text-sm font-semibold">{message}</div> : null}
      <div className="divide-y divide-line">
        {statements.map((statement) => (
          <div className="grid gap-3 p-4 md:grid-cols-[110px_140px_minmax(0,1fr)_auto] md:items-center" key={statement.id}>
            <div><div className="font-bold">Version {statement.version}</div><div className="text-xs text-muted">{new Date(statement.createdAt).toLocaleString("de-DE")}</div></div>
            <div className={`text-sm font-bold ${statement.status === "FINAL" ? "text-emerald-700" : "text-amber-700"}`}>{statement.status === "FINAL" ? "Festgeschrieben" : "Entwurf"}</div>
            <div className="text-sm text-muted" title={`Technische Pruefsumme: ${statement.checksum}`}>
              Datenstand eingefroren · Pruefcode {statement.checksum.slice(0, 8)}
            </div>
            <div className="flex flex-wrap gap-2">
              <a className="button button-secondary" href={`/api/service-charge-statements/${statement.id}`} target="_blank" rel="noreferrer">Protokoll</a>
              <a className="button button-secondary" href={`/api/service-charge-statements/${statement.id}/pdf`} target="_blank" rel="noreferrer">PDF</a>
              {statement.status !== "FINAL" ? <button disabled={Boolean(busy)} onClick={() => finalize(statement.id)} type="button">Festschreiben</button> : null}
              {statement.status !== "FINAL" ? <button className="button button-secondary" disabled={Boolean(busy)} onClick={() => remove(statement.id)} type="button">Ausblenden</button> : null}
            </div>
            {statement.tenants.length ? (
              <details className="md:col-span-4">
                <summary className="cursor-pointer text-sm font-semibold text-accent">Einzelabrechnungen ({statement.tenants.length})</summary>
                <div className="mt-2 flex flex-wrap gap-2">
                  {statement.tenants.map((tenant) => (
                    <a className="button button-secondary" href={`/api/service-charge-statements/${statement.id}/pdf?tenantId=${encodeURIComponent(tenant.id)}`} key={tenant.id} target="_blank" rel="noreferrer">{tenant.name}</a>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        ))}
        {!statements.length ? <div className="p-4 text-sm text-muted">Noch keine gespeicherte Abrechnungsversion.</div> : null}
      </div>
    </section>
  );
}
