"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { refreshCurrentView } from "@/lib/client-refresh";

export function QuickMoneyEdit({
  endpoint,
  field,
  label,
  value
}: {
  endpoint: string;
  field: string;
  label: string;
  value: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save(nextValue: string) {
    const formValue = nextValue.trim();
    if (formValue === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setMessage("");
    const response = await fetch(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: formValue })
    });
    setSaving(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Speichern fehlgeschlagen." }));
      setMessage(body.error || "Speichern fehlgeschlagen.");
      return;
    }
    setEditing(false);
    refreshCurrentView(router);
  }

  if (editing) {
    return (
      <div className="rounded-md bg-panel p-3">
        <label className="grid gap-1 text-xs font-semibold text-muted">
          {label}
          <input
            autoFocus
            name={field}
            type="number"
            step="0.01"
            value={draft}
            disabled={saving}
            onBlur={() => save(draft)}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setDraft(value);
                setEditing(false);
              }
            }}
          />
        </label>
        {message ? <div className="mt-1 text-xs text-red-700">{message}</div> : null}
        <div className="mt-1 text-xs text-muted">{saving ? "Speichert ..." : "Speichert automatisch beim Verlassen des Feldes."}</div>
      </div>
    );
  }

  return (
    <button
      className="w-full rounded-md !bg-panel p-3 text-left !text-ink hover:!bg-white"
      type="button"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
    >
      <div className="text-xs font-semibold text-muted">{label}</div>
      <div className="mt-1 font-semibold">{value ? money(Number(value)) : "offen"}</div>
    </button>
  );
}

function money(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}
