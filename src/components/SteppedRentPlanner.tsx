"use client";

import { useMemo, useState } from "react";

const percentageOptions = Array.from({ length: 12 }, (_, index) => (index + 1) * 0.5);
const yearOptions = Array.from({ length: 29 }, (_, index) => index + 2);
const roundingOptions = [1, 5, 10];

export function SteppedRentPlanner() {
  const [baseRent, setBaseRent] = useState("500");
  const [leaseStart, setLeaseStart] = useState(new Date().toISOString().slice(0, 10));
  const [startAfterMonths, setStartAfterMonths] = useState(12);
  const [percentage, setPercentage] = useState(3);
  const [rounding, setRounding] = useState(1);
  const [compoundRounded, setCompoundRounded] = useState(true);
  const [increaseYears, setIncreaseYears] = useState(5);

  const rows = useMemo(() => buildRows({
    baseRent: parseNumber(baseRent),
    leaseStart,
    startAfterMonths,
    percentage,
    rounding,
    compoundRounded,
    increaseYears
  }), [baseRent, leaseStart, startAfterMonths, percentage, rounding, compoundRounded, increaseYears]);

  const placeholderText = rows.map((row) => `${row.date}: Erhoehung um ${money(row.increase)} auf ${money(row.newRent)}.`).join("\n");

  return (
    <section className="rounded-b-lg rounded-tr-lg border border-line bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Staffelmiete</h2>
          <p className="mt-1 text-sm text-muted">Berechnet eine Staffel-Tabelle fuer den Platzhalter <code>{"{{stepped_rent}}"}</code>.</p>
        </div>
        <code className="rounded-md bg-emerald-50 px-3 py-2 text-xs font-bold text-accent">{"{{stepped_rent}}"}</code>
      </div>
      <details className="mt-4 rounded-md border border-line bg-panel">
        <summary className="cursor-pointer list-none px-3 py-2 text-sm font-bold [&::-webkit-details-marker]:hidden">Beispielanleitung aufklappen</summary>
        <div className="border-t border-line p-3 text-sm text-muted">
          Der Beginn ist die Anzahl Monate nach Mietbeginn. Liegt der Beginn unter 24 Monaten, muss im Vertrag eine gesonderte Zusatzvereinbarung stehen. Die Rundung erfolgt immer nach oben. Bei aktivem Zinseszins wird jede neue Erhoehung vom bereits gerundeten Mietwert berechnet.
        </div>
      </details>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label>Beispiel-Kaltmiete<input value={baseRent} onChange={(event) => setBaseRent(event.target.value)} inputMode="decimal" /></label>
        <label>Mietbeginn<input value={leaseStart} onChange={(event) => setLeaseStart(event.target.value)} type="date" /></label>
        <label>Beginn nach Monaten<input value={startAfterMonths} onChange={(event) => setStartAfterMonths(Number(event.target.value) || 0)} inputMode="numeric" /></label>
        <label>Erhoehung<select value={percentage} onChange={(event) => setPercentage(Number(event.target.value))}>{percentageOptions.map((value) => <option key={value} value={value}>{value.toLocaleString("de-DE")} %</option>)}</select></label>
        <label>Rundung<select value={rounding} onChange={(event) => setRounding(Number(event.target.value))}>{roundingOptions.map((value) => <option key={value} value={value}>{value} EUR nach oben</option>)}</select></label>
        <label>Anzahl der Mieterhoehungen<select value={increaseYears} onChange={(event) => setIncreaseYears(Number(event.target.value))}>{yearOptions.map((value) => <option key={value} value={value}>{value} Jahre</option>)}</select></label>
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={compoundRounded} onChange={(event) => setCompoundRounded(event.target.checked)} />
        Zinseszins vom gerundeten Wert berechnen
      </label>
      {startAfterMonths < 24 ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
          Beginn unter 24 Monaten: Bitte in den zusaetzlichen Vereinbarungen eine ausdrueckliche Klausel dazu aufnehmen.
        </div>
      ) : null}
      <div className="mt-5 overflow-hidden rounded-md border border-line">
        <div className="grid grid-cols-[1fr_1fr_1fr] bg-panel px-3 py-2 text-xs font-bold uppercase text-muted">
          <div>Datum der Erhoehung</div>
          <div>Betrag der Erhoehung</div>
          <div>Neue Kaltmiete</div>
        </div>
        {rows.map((row) => (
          <div className="grid grid-cols-[1fr_1fr_1fr] border-t border-line px-3 py-2 text-sm" key={row.date}>
            <div>{row.date}</div>
            <div>{money(row.increase)}</div>
            <div className="font-bold">{money(row.newRent)}</div>
          </div>
        ))}
      </div>
      <label className="mt-5 block">
        Text fuer den Platzhalter
        <textarea readOnly rows={Math.min(10, Math.max(4, rows.length))} value={placeholderText} className="font-mono text-sm" />
      </label>
    </section>
  );
}

function buildRows(input: { baseRent: number; leaseStart: string; startAfterMonths: number; percentage: number; rounding: number; compoundRounded: boolean; increaseYears: number }) {
  const rows: Array<{ date: string; increase: number; newRent: number }> = [];
  let rent = input.baseRent;
  let referenceRent = input.baseRent;
  const startDate = input.leaseStart ? new Date(`${input.leaseStart}T00:00:00`) : new Date();
  for (let index = 0; index < input.increaseYears; index += 1) {
    const rawNewRent = referenceRent * (1 + input.percentage / 100);
    const newRent = roundUp(rawNewRent, input.rounding);
    const date = new Date(startDate);
    date.setMonth(date.getMonth() + input.startAfterMonths + index * 12);
    rows.push({ date: new Intl.DateTimeFormat("de-DE").format(date), increase: newRent - rent, newRent });
    rent = newRent;
    referenceRent = input.compoundRounded ? newRent : input.baseRent;
  }
  return rows;
}

function roundUp(value: number, step: number) {
  if (!step) return Math.ceil(value);
  return Math.ceil(value / step) * step;
}

function parseNumber(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}
