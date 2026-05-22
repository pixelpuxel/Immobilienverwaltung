"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteUserButton({ userId, label = "Benutzer loeschen" }: { userId: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm("Diesen Benutzer wirklich loeschen? Zugeordnete Zugriffe und Profile werden entfernt.")) return;
    setBusy(true);
    const response = await fetch(`/api/users/${userId}`, { method: "DELETE" });
    setBusy(false);
    if (response.ok) router.refresh();
  }

  return (
    <button className="button-secondary px-3 py-2 text-sm" disabled={busy} type="button" onClick={remove}>
      {busy ? "Loesche..." : label}
    </button>
  );
}
