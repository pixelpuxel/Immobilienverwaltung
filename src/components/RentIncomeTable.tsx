"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type RentRow = {
  unitId: string;
  tenantProfileId: string | null;
  propertyName: string;
  unitNumber: string;
  tenantName: string;
  expectedColdRent: number;
  expectedServiceCharges: number;
  expectedTotalRent: number;
  paidColdRent: number;
  paidServiceCharges: number;
  paidTotalRent: number;
  status: string;
};

export function RentIncomeTable({ rows, year, month }: { rows: RentRow[]; year: number; month: number }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [partial, setPartial] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

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
        status
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

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-panel text-left text-xs uppercase text-muted">
            <tr>
              <th className="p-3">Immobilie / Einheit</th>
              <th className="p-3">Mieter</th>
              <th className="p-3 text-right">Kaltmiete</th>
              <th className="p-3 text-right">Nebenkosten</th>
              <th className="p-3 text-right">Gesamtmiete</th>
              <th className="p-3 text-right">Ist</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Aktion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr key={row.unitId}>
                <td className="p-3 font-semibold">{row.propertyName}<div className="text-xs text-muted">{row.unitNumber}</div></td>
                <td className="p-3">{row.tenantName || "kein laufender Mieter"}</td>
                <td className="p-3 text-right">{money(row.expectedColdRent)}</td>
                <td className="p-3 text-right">{money(row.expectedServiceCharges)}</td>
                <td className="p-3 text-right font-bold">{money(row.expectedTotalRent)}</td>
                <td className="p-3 text-right">
                  {editing === row.unitId ? (
                    <input className="w-28 text-right" value={partial[row.unitId] ?? String(row.paidTotalRent || "")} onChange={(event) => setPartial((current) => ({ ...current, [row.unitId]: event.target.value }))} inputMode="decimal" />
                  ) : money(row.paidTotalRent)}
                </td>
                <td className="p-3"><span className="rounded-full bg-panel px-2 py-1 text-xs font-bold">{statusLabel(row.status)}</span></td>
                <td className="p-3">
                  <div className="flex justify-end gap-2">
                    {editing === row.unitId ? (
                      <button className="px-3 py-2 text-sm" disabled={busy === row.unitId} onClick={() => save(row, "PARTIAL")} type="button">Teilzahlung speichern</button>
                    ) : (
                      <>
                        <button className="button-secondary px-3 py-2 text-sm" disabled={busy === row.unitId} onClick={() => setEditing(row.unitId)} type="button">Teilzahlung</button>
                        <button className="px-3 py-2 text-sm" disabled={busy === row.unitId} onClick={() => save(row, "PAID")} type="button">Bezahlt</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
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

function parseNumber(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function statusLabel(status: string) {
  if (status === "PAID") return "bezahlt";
  if (status === "PARTIAL") return "Teilzahlung";
  return "offen";
}
