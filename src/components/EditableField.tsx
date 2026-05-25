"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type EditableFieldProps = {
  label: string;
  value: string;
  field: string;
  endpoint: string;
  canEdit: boolean;
  type?: "text" | "number" | "textarea" | "select" | "checkbox";
  suffix?: string;
  options?: string[];
  displayValue?: string;
};

export function EditableField({
  label,
  value,
  field,
  endpoint,
  canEdit,
  type = "text",
  suffix = "",
  options = [],
  displayValue
}: EditableFieldProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(value || "");
  const [message, setMessage] = useState("");

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const formValue = String(new FormData(event.currentTarget).get(field) || "");
    const response = await fetch(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: formValue })
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Speichern fehlgeschlagen." }));
      setMessage(body.error || "Speichern fehlgeschlagen.");
      return;
    }
    setCurrentValue(formValue);
    setEditing(false);
    router.refresh();
  }

  if (editing) {
    return (
      <form className="rounded-md bg-panel p-3" onSubmit={save}>
        <label className="grid gap-2 text-sm">
          <span className="text-xs font-semibold uppercase text-muted">{label}</span>
          {type === "textarea" ? (
            <textarea name={field} defaultValue={currentValue} />
          ) : type === "select" ? (
            <select name={field} defaultValue={currentValue}>
              <option value="">offen</option>
              {options.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          ) : type === "checkbox" ? (
            <label className="flex items-center gap-2 text-sm font-semibold text-muted">
              <input name={field} type="checkbox" defaultChecked={currentValue === "true"} />
              aktiv
            </label>
          ) : (
            <input name={field} type={type} step={type === "number" ? "0.01" : undefined} defaultValue={currentValue} />
          )}
        </label>
        {message ? <div className="mt-2 text-sm text-red-700">{message}</div> : null}
        <div className="mt-3 grid gap-2 sm:flex">
          <button type="submit">Speichern</button>
          <button className="button-secondary" type="button" onClick={() => setEditing(false)}>Abbrechen</button>
        </div>
      </form>
    );
  }

  return (
    <div className="rounded-md bg-panel p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase text-muted">{label}</div>
          <div className="mt-1">{type === "checkbox" ? (currentValue === "true" ? "Ja" : "Nein") : currentValue ? (displayValue || `${currentValue}${suffix}`) : "-"}</div>
        </div>
        {canEdit ? (
          <button className="button-secondary px-3 py-1 text-xs" type="button" onClick={() => setEditing(true)}>Bearbeiten</button>
        ) : null}
      </div>
    </div>
  );
}
