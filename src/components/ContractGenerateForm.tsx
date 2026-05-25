"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Option = { id: string; label: string };

export function ContractGenerateForm({
  tenants,
  units,
  templates,
  defaultUnitId = ""
}: {
  tenants: Option[];
  units: Option[];
  templates: Option[];
  defaultUnitId?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setProgress(8);
    timer.current = setInterval(() => setProgress((value) => Math.min(value + 6, 88)), 450);
    const raw = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(raw)
    });
    if (timer.current) clearInterval(timer.current);
    if (!response.ok) {
      setProgress(0);
      setBusy(false);
      const body = await response.json().catch(() => ({ error: "Vertrag konnte nicht erzeugt werden." }));
      setMessage(body.error || "Vertrag konnte nicht erzeugt werden.");
      return;
    }
    const contract = await response.json();
    setProgress(92);
    setMessage("Vertrag erzeugt. Vorschau wird bereitgestellt...");
    const ready = await waitForContract(contract.id);
    if (!ready) {
      setBusy(false);
      setMessage("Vertrag wurde erzeugt, die Vorschau ist aber noch nicht erreichbar. Bitte Seite neu laden.");
      return;
    }
    setProgress(100);
    setMessage("Vertrag ist bereit. Seite wird aktualisiert...");
    router.refresh();
    window.setTimeout(() => window.location.reload(), 350);
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-lg border border-line bg-panel p-4">
      <h2 className="text-xl font-bold">Vertrag generieren</h2>
      {message ? <div className="rounded-md border border-line bg-white p-3 text-sm">{message}</div> : null}
      <label>Mieter<select name="tenantProfileId" required>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.label}</option>)}</select></label>
      <label>Einheit<select name="unitId" required defaultValue={defaultUnitId}>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}</select></label>
      <label>Vorlage<select name="templateId"><option value="">Standard</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}</select></label>
      {busy || progress > 0 ? (
        <div className="grid gap-2">
          <div className="h-3 overflow-hidden rounded-full bg-white">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="text-xs text-muted">{busy ? "DOCX wird erstellt und PDF wird erzeugt..." : "Fertig."}</div>
        </div>
      ) : null}
      <button disabled={busy} type="submit">{busy ? "Erzeuge..." : "Vertrag generieren"}</button>
    </form>
  );
}

async function waitForContract(contractId: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(`/api/contracts/${contractId}/preview`, { cache: "no-store" }).catch(() => null);
    if (response?.ok) return true;
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  return false;
}
