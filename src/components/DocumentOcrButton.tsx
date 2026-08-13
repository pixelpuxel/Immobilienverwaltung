"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { refreshCurrentView } from "@/lib/client-refresh";

export function DocumentOcrButton({ documentId, status }: { documentId: string; status?: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function runOcr() {
    setBusy(true);
    setMessage("");
    const response = await fetch(`/api/documents/${documentId}/ocr`, { method: "POST" });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage(body.error || "OCR fehlgeschlagen.");
      return;
    }
    setMessage(body.status === "EMPTY" ? "OCR fertig, kein Text erkannt." : "OCR fertig.");
    refreshCurrentView(router);
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
      <span className="rounded-full bg-white px-2 py-1 font-semibold text-muted">OCR: {status || "nicht ausgeführt"}</span>
      <button className="button-secondary px-3 py-2 text-sm" disabled={busy} onClick={runOcr} type="button">
        {busy ? "OCR laeuft..." : "OCR ausfuehren"}
      </button>
      {message ? <span className="text-muted">{message}</span> : null}
    </div>
  );
}
