"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { refreshCurrentView } from "@/lib/client-refresh";

export function CategoryVisibilityForm({
  category
}: {
  category: {
    id: string;
    visibleToBroker: boolean;
    visibleToTenant: boolean;
  };
}) {
  const router = useRouter();
  const [broker, setBroker] = useState(category.visibleToBroker);
  const [tenant, setTenant] = useState(category.visibleToTenant);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(nextBroker: boolean, nextTenant: boolean) {
    setBroker(nextBroker);
    setTenant(nextTenant);
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/document-categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: category.id,
        visibleToBroker: nextBroker,
        visibleToTenant: nextTenant
      })
    });
    setSaving(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Speichern fehlgeschlagen." }));
      setBroker(category.visibleToBroker);
      setTenant(category.visibleToTenant);
      setMessage(body.error || "Speichern fehlgeschlagen.");
      return;
    }
    setMessage("Gespeichert");
    refreshCurrentView(router);
  }

  return (
    <div className="grid gap-2 sm:grid-cols-[92px_92px_minmax(70px,1fr)] sm:items-center">
      <Toggle
        checked={broker}
        disabled={saving}
        label="Makler"
        onChange={(checked) => save(checked, tenant)}
      />
      <Toggle
        checked={tenant}
        disabled={saving}
        label="Mieter"
        onChange={(checked) => save(broker, checked)}
      />
      <div className="min-h-5 text-xs font-semibold text-muted sm:text-right">
        {saving ? "Speichert..." : message}
      </div>
    </div>
  );
}

function Toggle({
  checked,
  disabled,
  label,
  onChange
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`flex h-10 items-center justify-between gap-2 rounded-md border px-3 text-xs font-bold ${checked ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-line bg-white text-muted"}`}>
      <span>{label}</span>
      <input
        aria-label={`${label} darf Dokumentart sehen`}
        checked={checked}
        className="h-4 w-4 accent-emerald-700"
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
    </label>
  );
}
