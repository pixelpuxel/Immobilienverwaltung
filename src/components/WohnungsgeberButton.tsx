"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { reloadCurrentView } from "@/lib/client-refresh";

export function WohnungsgeberButton({ tenantProfileId }: { tenantProfileId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");

  async function generate() {
    setMessage("");
    const response = await fetch(`/api/tenants/${tenantProfileId}/wohnungsgeberbestaetigung`, { method: "POST" });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Dokument konnte nicht erstellt werden." }));
      setMessage(body.error || "Dokument konnte nicht erstellt werden.");
      return;
    }
    setMessage("Wohnungsgeberbestaetigung erstellt.");
    reloadCurrentView(router);
  }

  return (
    <div className="grid gap-2">
      <button type="button" onClick={generate}>Wohnungsgeberbestaetigung erstellen</button>
      {message ? <div className="text-sm text-muted">{message}</div> : null}
    </div>
  );
}
