"use client";

import { useMemo, useState } from "react";

type TestRun = {
  at?: string;
  environment?: string;
  answer?: string;
  satisfactory?: boolean | null;
  notes?: string;
};

type TestCase = {
  id: string;
  area: string;
  prompt: string;
  expected: string;
  status: string;
  lastRun: TestRun | null;
};

type TestCatalog = {
  version: number;
  updatedAt: string;
  purpose: string;
  cases: TestCase[];
  [key: string]: unknown;
};

type AgentRegressionTestsProps = {
  initialData: unknown;
};

const emptyRun: TestRun = { answer: "", satisfactory: null, notes: "" };

export function AgentRegressionTests({ initialData }: AgentRegressionTestsProps) {
  const [catalog, setCatalog] = useState<TestCatalog>(() => normalizeCatalog(initialData));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const rawJson = useMemo(() => JSON.stringify(catalog, null, 2), [catalog]);

  function updateRoot<K extends keyof TestCatalog>(key: K, value: TestCatalog[K]) {
    setCatalog((current) => ({ ...current, [key]: value }));
  }

  function updateCase(id: string, patch: Partial<TestCase>) {
    setCatalog((current) => ({
      ...current,
      cases: current.cases.map((item) => item.id === id ? { ...item, ...patch } : item)
    }));
  }

  function updateRun(id: string, patch: Partial<TestRun>) {
    setCatalog((current) => ({
      ...current,
      cases: current.cases.map((item) => item.id === id
        ? { ...item, lastRun: { ...(item.lastRun || emptyRun), ...patch } }
        : item)
    }));
  }

  function addCase() {
    const id = `manual-${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`;
    setCatalog((current) => ({
      ...current,
      cases: [
        {
          id,
          area: "Agent",
          prompt: "",
          expected: "",
          status: "open",
          lastRun: null
        },
        ...current.cases
      ]
    }));
  }

  function removeCase(id: string) {
    setCatalog((current) => ({ ...current, cases: current.cases.filter((item) => item.id !== id) }));
  }

  async function save(nextCatalog = catalog, successMessage = "Agent-Testkatalog gespeichert.") {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/agent/regression-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", data: nextCatalog })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(body.error || "Testkatalog konnte nicht gespeichert werden.");
        return null;
      }
      const normalized = normalizeCatalog(body);
      setCatalog(normalized);
      setMessage(successMessage);
      return normalized;
    } finally {
      setBusy(false);
    }
  }

  async function runCase(item: TestCase) {
    if (!item.prompt.trim()) {
      setMessage("Bitte zuerst eine Testfrage eintragen.");
      return;
    }
    setRunningId(item.id);
    setMessage("");
    try {
      const response = await fetch("/api/agent/regression-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run", caseId: item.id, prompt: item.prompt })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(body.error || "Test konnte nicht ausgefuehrt werden.");
        return;
      }
      setCatalog(normalizeCatalog(body.data));
      setMessage("Test ausgefuehrt. Bitte Ergebnis bewerten.");
    } finally {
      setRunningId(null);
    }
  }

  async function rateCase(item: TestCase, satisfactory: boolean) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/agent/regression-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rate",
          caseId: item.id,
          satisfactory,
          status: satisfactory ? "ok" : "bug",
          notes: item.lastRun?.notes || ""
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(body.error || "Bewertung konnte nicht gespeichert werden.");
        return;
      }
      setCatalog(normalizeCatalog(body));
      setMessage(satisfactory ? "Test als OK bewertet." : "Test als Bug markiert.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-line bg-white">
      <div className="border-b border-line p-4">
        <div className="font-bold">Agent-Testkatalog</div>
        <p className="mt-1 text-sm text-muted">
          Diese Fragen werden nach Agent-Fixes erneut getestet. Antworten und Bewertung werden hier protokolliert.
        </p>
      </div>
      <div className="grid gap-4 p-4">
        <details className="rounded-lg border border-line bg-panel p-3" open>
          <summary className="cursor-pointer font-bold">Katalog</summary>
          <div className="mt-3 grid gap-3">
            <div className="grid gap-3 md:grid-cols-[120px_minmax(0,1fr)] md:items-center">
              <label className="text-sm font-bold text-muted">Version</label>
              <input type="number" value={catalog.version} onChange={(event) => updateRoot("version", Number(event.target.value) || 1)} />
              <label className="text-sm font-bold text-muted">Zweck</label>
              <textarea className="min-h-24" value={catalog.purpose} onChange={(event) => updateRoot("purpose", event.target.value)} />
              <label className="text-sm font-bold text-muted">Aktualisiert</label>
              <input value={catalog.updatedAt} onChange={(event) => updateRoot("updatedAt", event.target.value)} />
            </div>
          </div>
        </details>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-muted">{catalog.cases.length} Testfragen</div>
          <div className="flex flex-wrap gap-2">
            <button className="button-secondary px-3 py-2 text-sm" onClick={addCase} type="button">Test hinzufügen</button>
            <button disabled={busy} onClick={() => save()} type="button">{busy ? "Speichere..." : "Alles speichern"}</button>
          </div>
        </div>

        <div className="grid gap-3">
          {catalog.cases.map((item, index) => (
            <details className="overflow-hidden rounded-lg border border-line bg-white" key={item.id || index} open={index === 0}>
              <summary className="cursor-pointer list-none bg-[linear-gradient(135deg,#f7fcf8,#eef4ff)] p-3 [&::-webkit-details-marker]:hidden">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-accent px-2 py-1 text-xs font-bold text-white">›</span>
                      <span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-muted">{item.area || "Agent"}</span>
                      <StatusBadge item={item} />
                    </div>
                    <div className="mt-2 break-words font-semibold">{item.prompt || "Neue Testfrage ohne Text"}</div>
                  </div>
                  <button className="button-secondary px-3 py-2 text-sm" disabled={runningId === item.id} onClick={(event) => { event.preventDefault(); void runCase(item); }} type="button">
                    {runningId === item.id ? "Teste..." : "Testen"}
                  </button>
                </div>
              </summary>
              <div className="grid gap-4 border-t border-line p-4">
                <details className="rounded-lg border border-line bg-panel p-3" open>
                  <summary className="cursor-pointer font-bold">Testfrage</summary>
                  <div className="mt-3 grid gap-3">
                    <Field label="ID" value={item.id} onChange={(value) => updateCase(item.id, { id: value })} />
                    <Field label="Bereich" value={item.area} onChange={(value) => updateCase(item.id, { area: value })} />
                    <label className="grid gap-1 text-sm font-semibold">
                      Abfrage
                      <textarea className="min-h-24" value={item.prompt} onChange={(event) => updateCase(item.id, { prompt: event.target.value })} />
                    </label>
                    <label className="grid gap-1 text-sm font-semibold">
                      Erwartetes Ergebnis
                      <textarea className="min-h-24" value={item.expected} onChange={(event) => updateCase(item.id, { expected: event.target.value })} />
                    </label>
                    <label className="grid gap-1 text-sm font-semibold">
                      Status
                      <select value={item.status} onChange={(event) => updateCase(item.id, { status: event.target.value })}>
                        <option value="open">open</option>
                        <option value="tested">tested</option>
                        <option value="ok">ok</option>
                        <option value="bug">bug</option>
                        <option value="ignored">ignored</option>
                      </select>
                    </label>
                  </div>
                </details>

                <details className="rounded-lg border border-line bg-panel p-3" open={Boolean(item.lastRun)}>
                  <summary className="cursor-pointer font-bold">Letzter Lauf</summary>
                  <div className="mt-3 grid gap-3">
                    <Field label="Zeitpunkt" value={item.lastRun?.at || ""} onChange={(value) => updateRun(item.id, { at: value })} />
                    <Field label="Umgebung" value={item.lastRun?.environment || ""} onChange={(value) => updateRun(item.id, { environment: value })} />
                    <label className="grid gap-1 text-sm font-semibold">
                      Antwort
                      <textarea className="min-h-48 font-mono text-xs leading-5" value={item.lastRun?.answer || ""} onChange={(event) => updateRun(item.id, { answer: event.target.value })} />
                    </label>
                    <label className="grid gap-1 text-sm font-semibold">
                      Bewertung / Analyse
                      <textarea className="min-h-20" value={item.lastRun?.notes || ""} onChange={(event) => updateRun(item.id, { notes: event.target.value })} />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button className="button-secondary px-3 py-2 text-sm" onClick={() => updateRun(item.id, { satisfactory: null })} type="button">Unbewertet</button>
                      <button className="px-3 py-2 text-sm" disabled={busy} onClick={() => rateCase(item, true)} type="button">Ist OK</button>
                      <button className="button-danger px-3 py-2 text-sm" disabled={busy} onClick={() => rateCase(item, false)} type="button">Ist Bug</button>
                    </div>
                  </div>
                </details>

                <div className="flex flex-wrap justify-between gap-2">
                  <button className="button-secondary px-3 py-2 text-sm" disabled={runningId === item.id} onClick={() => runCase(item)} type="button">
                    {runningId === item.id ? "Teste..." : "Test ausführen"}
                  </button>
                  <button className="button-danger px-3 py-2 text-sm" onClick={() => removeCase(item.id)} type="button">Test löschen</button>
                </div>
              </div>
            </details>
          ))}
        </div>

        <details className="rounded-lg border border-line bg-panel p-3" open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}>
          <summary className="cursor-pointer font-bold">JSON-Rohansicht</summary>
          <pre className="mt-3 max-h-96 overflow-auto rounded-md border border-line bg-white p-3 text-xs leading-5">{rawJson}</pre>
        </details>

        {message ? <div className="rounded-md bg-panel p-3 text-sm font-semibold">{message}</div> : null}
      </div>
    </section>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-sm font-semibold">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function StatusBadge({ item }: { item: TestCase }) {
  if (item.lastRun?.satisfactory === true) return <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-800">OK</span>;
  if (item.lastRun?.satisfactory === false || item.status === "bug") return <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-800">Bug</span>;
  if (item.status === "tested") return <span className="rounded-full bg-sky-100 px-2 py-1 text-xs font-bold text-sky-800">getestet</span>;
  return <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">{item.status || "open"}</span>;
}

function normalizeCatalog(value: unknown): TestCatalog {
  const source = typeof value === "object" && value !== null ? value as Partial<TestCatalog> : {};
  const cases = Array.isArray(source.cases) ? source.cases : [];
  return {
    ...source,
    version: Number(source.version) || 1,
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : new Date().toISOString(),
    purpose: typeof source.purpose === "string" ? source.purpose : "Regressionstest-Katalog fuer den Portal-Agenten.",
    cases: cases.map((item, index) => normalizeCase(item, index))
  };
}

function normalizeCase(value: unknown, index: number): TestCase {
  const source = typeof value === "object" && value !== null ? value as Partial<TestCase> : {};
  return {
    id: typeof source.id === "string" && source.id ? source.id : `case-${index + 1}`,
    area: typeof source.area === "string" ? source.area : "Agent",
    prompt: typeof source.prompt === "string" ? source.prompt : "",
    expected: typeof source.expected === "string" ? source.expected : "",
    status: typeof source.status === "string" ? source.status : "open",
    lastRun: source.lastRun && typeof source.lastRun === "object" ? { ...source.lastRun } : null
  };
}
