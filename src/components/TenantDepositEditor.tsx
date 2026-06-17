"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";
import { refreshCurrentView } from "@/lib/client-refresh";

type TenantDeposit = {
  id: string;
  deposit: string;
  depositPaidAmount: string;
  depositPaidAt: string;
  depositReturnedAmount: string;
  depositReturnedAt: string;
  depositStatus: string;
};

export function TenantDepositEditor({ tenant }: { tenant: TenantDeposit }) {
  const router = useRouter();
  const [message, setMessage] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/tenants/${tenant.id}/deposit`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deposit: form.get("deposit"),
        depositPaidAmount: form.get("depositPaidAmount"),
        depositPaidAt: form.get("depositPaidAt"),
        depositReturnedAmount: form.get("depositReturnedAmount"),
        depositReturnedAt: form.get("depositReturnedAt"),
        depositStatus: form.get("depositStatus")
      })
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Kaution konnte nicht gespeichert werden." }));
      setMessage(body.error || "Kaution konnte nicht gespeichert werden.");
      return;
    }
    setMessage("Kaution gespeichert.");
    refreshCurrentView(router);
  }

  return (
    <details className="mt-3 rounded-md border border-line bg-white">
      <summary className="cursor-pointer list-none px-3 py-2 text-xs font-bold text-muted [&::-webkit-details-marker]:hidden">Kaution bearbeiten</summary>
      <form className="grid gap-2 border-t border-line p-3 text-xs" onSubmit={save}>
        <label className="grid gap-1">Kaution Soll<input name="deposit" type="number" step="0.01" defaultValue={tenant.deposit} /></label>
        <label className="grid gap-1">Gezahlt<input name="depositPaidAmount" type="number" step="0.01" defaultValue={tenant.depositPaidAmount} /></label>
        <label className="grid gap-1">Zahlungsdatum<input name="depositPaidAt" type="date" defaultValue={tenant.depositPaidAt} /></label>
        <label className="grid gap-1">Zurückgezahlt<input name="depositReturnedAmount" type="number" step="0.01" defaultValue={tenant.depositReturnedAmount} /></label>
        <label className="grid gap-1">Rückzahlungsdatum<input name="depositReturnedAt" type="date" defaultValue={tenant.depositReturnedAt} /></label>
        <label className="grid gap-1">Status
          <select name="depositStatus" defaultValue={tenant.depositStatus || "OPEN"}>
            <option value="OPEN">offen</option>
            <option value="PAID">bezahlt / aktiv</option>
            <option value="PARTIAL_RETURNED">teilweise zurückgezahlt</option>
            <option value="RETURNED">vollständig zurückgezahlt</option>
          </select>
        </label>
        {message ? <div className="text-muted">{message}</div> : null}
        <button className="px-3 py-2 text-sm" type="submit">Kaution speichern</button>
      </form>
    </details>
  );
}
