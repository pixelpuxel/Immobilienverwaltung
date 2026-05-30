"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { reloadCurrentView } from "@/lib/client-refresh";

export function DeleteContractButton({ contractId }: { contractId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm("Diesen generierten Vertrag wirklich loeschen?")) return;
    setBusy(true);
    const response = await fetch(`/api/contracts/${contractId}`, { method: "DELETE" });
    setBusy(false);
    if (response.ok) reloadCurrentView(router);
  }

  return (
    <button className="button-secondary flex min-h-11 min-w-28 flex-none items-center justify-center px-3 py-2 text-sm" disabled={busy} type="button" onClick={remove}>
      {busy ? "Loesche..." : "Loeschen"}
    </button>
  );
}
