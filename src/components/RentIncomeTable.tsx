"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, type ReactNode, useMemo, useState } from "react";

type RentRow = {
  unitId: string;
  tenantProfileId: string | null;
  propertyId: string;
  propertyName: string;
  unitNumber: string;
  tenantName: string;
  tenantHref: string;
  contractHref: string;
  contractLabel: string;
  expectedColdRent: number;
  expectedServiceCharges: number;
  expectedTotalRent: number;
  paidColdRent: number;
  paidServiceCharges: number;
  paidTotalRent: number;
  status: string;
  paidAt: string;
};

type SortKey = "propertyName" | "unitNumber" | "tenantName" | "expectedColdRent" | "expectedServiceCharges" | "expectedTotalRent" | "status";

export function RentIncomeTable({ rows, year, month }: { rows: RentRow[]; year: number; month: number }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [partial, setPartial] = useState<Record<string, string>>({});
  const [paidDates, setPaidDates] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "propertyName", direction: "asc" });

  const grouped = useMemo(() => groupAndSortRows(rows, sort), [rows, sort]);

  async function save(row: RentRow, status: "PAID" | "PARTIAL" | "OPEN") {
    setBusy(row.unitId);
    const paidTotal = status === "PARTIAL" ? parseNumber(partial[row.unitId] || String(row.paidTotalRent || row.expectedTotalRent)) : status === "PAID" ? row.expectedTotalRent : 0;
    await fetch("/api/rent-payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        unitId: row.unitId,
        tenantProfileId: row.tenantProfileId,
        year,
        month,
        expectedColdRent: row.expectedColdRent,
        expectedServiceCharges: row.expectedServiceCharges,
        expectedTotalRent: row.expectedTotalRent,
        paidTotalRent: paidTotal,
        status,
        paidAt: status === "OPEN" ? null : (paidDates[row.unitId] || todayInput())
      })
    });
    setBusy(null);
    setEditing(null);
    router.refresh();
  }

  const totals = rows.reduce((sum, row) => ({
    expectedColdRent: sum.expectedColdRent + row.expectedColdRent,
    expectedServiceCharges: sum.expectedServiceCharges + row.expectedServiceCharges,
    expectedTotalRent: sum.expectedTotalRent + row.expectedTotalRent,
    paidColdRent: sum.paidColdRent + row.paidColdRent,
    paidServiceCharges: sum.paidServiceCharges + row.paidServiceCharges,
    paidTotalRent: sum.paidTotalRent + row.paidTotalRent
  }), { expectedColdRent: 0, expectedServiceCharges: 0, expectedTotalRent: 0, paidColdRent: 0, paidServiceCharges: 0, paidTotalRent: 0 });

  function toggleSort(key: SortKey) {
    setSort((current) => current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" });
  }

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] text-sm">
          <thead className="bg-panel text-left text-xs uppercase text-muted">
            <tr>
              <SortHeader active={sort} id="propertyName" onSort={toggleSort}>Immobilie</SortHeader>
              <SortHeader active={sort} id="unitNumber" onSort={toggleSort}>Einheit</SortHeader>
              <SortHeader active={sort} id="tenantName" onSort={toggleSort}>Mieter</SortHeader>
              <SortHeader active={sort} align="right" id="expectedColdRent" onSort={toggleSort}>Kaltmiete</SortHeader>
              <SortHeader active={sort} align="right" id="expectedServiceCharges" onSort={toggleSort}>Nebenkosten</SortHeader>
              <SortHeader active={sort} align="right" id="expectedTotalRent" onSort={toggleSort}>Gesamtmiete</SortHeader>
              <th className="p-3 text-right">Ist</th>
              <SortHeader active={sort} id="status" onSort={toggleSort}>Status</SortHeader>
              <th className="p-3 text-right">Aktion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {grouped.map((group) => (
              <Fragment key={group.propertyId}>
                <tr className="bg-emerald-50/60 font-bold">
                  <td className="p-3">
                    <Link className="hover:underline" href={`/properties/${group.propertyId}`}>{group.propertyName}</Link>
                  </td>
                  <td className="p-3 text-muted">{group.rows.length} Einheit(en)</td>
                  <td className="p-3 text-muted">Objektsumme</td>
                  <td className="p-3 text-right">{money(group.expectedColdRent)}</td>
                  <td className="p-3 text-right">{money(group.expectedServiceCharges)}</td>
                  <td className="p-3 text-right">{money(group.expectedTotalRent)}</td>
                  <td className="p-3 text-right">{money(group.paidTotalRent)}</td>
                  <td className="p-3" colSpan={2}>{statusSummary(group.rows)}</td>
                </tr>
                {group.rows.map((row) => (
                  <tr key={row.unitId}>
                    <td className="p-3 pl-6 text-muted">↳</td>
                    <td className="p-3 font-semibold">
                      <Link className="hover:underline" href={`/properties/${row.propertyId}#unit-${row.unitId}`}>{row.unitNumber}</Link>
                    </td>
                    <td className="p-3">
                      {row.tenantHref ? <Link className="font-semibold hover:underline" href={row.tenantHref}>{row.tenantName}</Link> : "kein laufender Mieter"}
                      <div className="mt-1 text-xs">
                        {row.contractHref ? <Link className="text-accent hover:underline" href={row.contractHref}>Mietvertrag öffnen</Link> : <span className="text-muted">kein Mietvertrag verfügbar</span>}
                      </div>
                    </td>
                    <td className="p-3 text-right">{money(row.expectedColdRent)}</td>
                    <td className="p-3 text-right">{money(row.expectedServiceCharges)}</td>
                    <td className="p-3 text-right font-bold">{money(row.expectedTotalRent)}</td>
                    <td className="p-3 text-right">
                      {editing === row.unitId ? (
                        <input className="w-28 text-right" value={partial[row.unitId] ?? String(row.paidTotalRent || "")} onChange={(event) => setPartial((current) => ({ ...current, [row.unitId]: event.target.value }))} inputMode="decimal" />
                      ) : money(row.paidTotalRent)}
                      {row.paidAt ? <div className="text-xs text-muted">{formatDate(row.paidAt)}</div> : null}
                    </td>
                    <td className="p-3"><span className="rounded-full bg-panel px-2 py-1 text-xs font-bold">{statusLabel(row.status)}</span></td>
                    <td className="p-3">
                      <div className="grid justify-end gap-2">
                        {editing === row.unitId ? (
                          <>
                            <input className="min-h-9 text-sm" type="date" value={paidDates[row.unitId] || todayInput()} onChange={(event) => setPaidDates((current) => ({ ...current, [row.unitId]: event.currentTarget.value }))} />
                            <button className="px-3 py-2 text-sm" disabled={busy === row.unitId} onClick={() => save(row, "PARTIAL")} type="button">Teilzahlung speichern</button>
                            <button className="button-secondary px-3 py-2 text-sm" onClick={() => setEditing(null)} type="button">Abbrechen</button>
                          </>
                        ) : (
                          <>
                            <input className="min-h-9 text-sm" type="date" value={paidDates[row.unitId] || row.paidAt || todayInput()} onChange={(event) => setPaidDates((current) => ({ ...current, [row.unitId]: event.currentTarget.value }))} />
                            <button className="button-secondary px-3 py-2 text-sm" disabled={busy === row.unitId} onClick={() => {
                              setEditing(row.unitId);
                              setPaidDates((current) => ({ ...current, [row.unitId]: row.paidAt || todayInput() }));
                            }} type="button">Teilzahlung</button>
                            <button className="px-3 py-2 text-sm" disabled={busy === row.unitId} onClick={() => {
                              setPaidDates((current) => ({ ...current, [row.unitId]: todayInput() }));
                              save(row, "PAID");
                            }} type="button">Bezahlt</button>
                            {row.status !== "OPEN" ? <button className="button-secondary px-3 py-2 text-sm" disabled={busy === row.unitId} onClick={() => window.confirm("Zahlung wirklich zurücksetzen?") && save(row, "OPEN")} type="button">Zurücksetzen</button> : null}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 border-t border-line bg-panel p-4 md:grid-cols-2">
        <TotalCard title="SOLL" cold={totals.expectedColdRent} charges={totals.expectedServiceCharges} total={totals.expectedTotalRent} />
        <TotalCard title="IST" cold={totals.paidColdRent} charges={totals.paidServiceCharges} total={totals.paidTotalRent} />
      </div>
    </div>
  );
}

function SortHeader({ id, active, onSort, align = "left", children }: { id: SortKey; active: { key: SortKey; direction: "asc" | "desc" }; onSort: (id: SortKey) => void; align?: "left" | "right"; children: ReactNode }) {
  const suffix = active.key === id ? active.direction === "asc" ? " ↑" : " ↓" : "";
  return (
    <th className={`p-3 ${align === "right" ? "text-right" : ""}`}>
      <button className="text-xs font-bold uppercase text-muted hover:text-foreground" type="button" onClick={() => onSort(id)}>
        {children}{suffix}
      </button>
    </th>
  );
}

function TotalCard({ title, cold, charges, total }: { title: string; cold: number; charges: number; total: number }) {
  return (
    <div className="rounded-md bg-white p-3">
      <div className="text-xs font-bold text-muted">{title}</div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
        <div><div className="text-muted">Kalt</div><strong>{money(cold)}</strong></div>
        <div><div className="text-muted">NK</div><strong>{money(charges)}</strong></div>
        <div><div className="text-muted">Gesamt</div><strong>{money(total)}</strong></div>
      </div>
    </div>
  );
}

function groupAndSortRows(rows: RentRow[], sort: { key: SortKey; direction: "asc" | "desc" }) {
  const map = new Map<string, RentRow[]>();
  for (const row of rows) map.set(row.propertyId, [...(map.get(row.propertyId) || []), row]);
  const groups = Array.from(map.entries()).map(([propertyId, list]) => {
    const sortedRows = [...list].sort((a, b) => compare(a, b, sort.key, sort.direction));
    return {
      propertyId,
      propertyName: list[0]?.propertyName || "Immobilie",
      rows: sortedRows,
      expectedColdRent: sum(list, "expectedColdRent"),
      expectedServiceCharges: sum(list, "expectedServiceCharges"),
      expectedTotalRent: sum(list, "expectedTotalRent"),
      paidTotalRent: sum(list, "paidTotalRent"),
      status: list.every((row) => row.status === "PAID") ? "PAID" : list.some((row) => row.status !== "OPEN") ? "PARTIAL" : "OPEN"
    };
  });
  return groups.sort((a, b) => {
    if (sort.key === "propertyName") return compareText(a.propertyName, b.propertyName, sort.direction);
    if (sort.key === "expectedColdRent") return compareNumber(a.expectedColdRent, b.expectedColdRent, sort.direction);
    if (sort.key === "expectedServiceCharges") return compareNumber(a.expectedServiceCharges, b.expectedServiceCharges, sort.direction);
    if (sort.key === "expectedTotalRent") return compareNumber(a.expectedTotalRent, b.expectedTotalRent, sort.direction);
    if (sort.key === "status") return compareText(a.status, b.status, sort.direction);
    return compareText(a.propertyName, b.propertyName, "asc");
  });
}

function compare(a: RentRow, b: RentRow, key: SortKey, direction: "asc" | "desc") {
  if (key === "expectedColdRent" || key === "expectedServiceCharges" || key === "expectedTotalRent") return compareNumber(a[key], b[key], direction);
  return compareText(String(a[key] || ""), String(b[key] || ""), direction);
}

function compareText(a: string, b: string, direction: "asc" | "desc") {
  const value = a.localeCompare(b, "de");
  return direction === "asc" ? value : -value;
}

function compareNumber(a: number, b: number, direction: "asc" | "desc") {
  const value = a - b;
  return direction === "asc" ? value : -value;
}

function sum(rows: RentRow[], key: "expectedColdRent" | "expectedServiceCharges" | "expectedTotalRent" | "paidTotalRent") {
  return rows.reduce((total, row) => total + row[key], 0);
}

function statusSummary(rows: RentRow[]) {
  const paid = rows.filter((row) => row.status === "PAID").length;
  const partial = rows.filter((row) => row.status === "PARTIAL").length;
  const open = rows.length - paid - partial;
  return `${paid} bezahlt · ${partial} Teilzahlung · ${open} offen`;
}

function parseNumber(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function money(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-DE").format(new Date(value));
}

function statusLabel(status: string) {
  if (status === "PAID") return "bezahlt";
  if (status === "PARTIAL") return "Teilzahlung";
  return "offen";
}
