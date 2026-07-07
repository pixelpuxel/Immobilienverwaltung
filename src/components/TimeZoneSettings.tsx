"use client";

import { useState } from "react";

const TIME_ZONE_OPTIONS = [
  "Europe/Berlin",
  "Europe/Vienna",
  "Europe/Zurich",
  "Europe/London",
  "UTC"
];

export function TimeZoneSettings({ initialTimeZone }: { initialTimeZone: string }) {
  const [timeZone, setTimeZone] = useState(initialTimeZone);
  const [custom, setCustom] = useState(TIME_ZONE_OPTIONS.includes(initialTimeZone) ? "" : initialTimeZone);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedTimeZone = timeZone === "custom" ? custom.trim() : timeZone;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/settings/time-zone", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeZone: selectedTimeZone })
    });
    setBusy(false);
    const body = await response.json().catch(() => ({ error: "Zeitzone konnte nicht gespeichert werden." }));
    if (!response.ok) {
      setMessage(body.error || "Zeitzone konnte nicht gespeichert werden.");
      return;
    }
    setMessage("Zeitzone gespeichert. Neue Zeitstempel werden jetzt entsprechend angezeigt.");
  }

  return (
    <form className="grid gap-3" onSubmit={save}>
      <label>
        Zeitzone
        <select value={timeZone} onChange={(event) => setTimeZone(event.target.value)}>
          {TIME_ZONE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          <option value="custom">Andere IANA-Zeitzone...</option>
        </select>
      </label>
      {timeZone === "custom" ? (
        <label>
          IANA-Zeitzone
          <input value={custom} onChange={(event) => setCustom(event.target.value)} placeholder="Europe/Berlin" />
        </label>
      ) : null}
      <div className="rounded-md bg-panel p-3 text-sm text-muted">
        Aktuell verwendet: <strong className="text-fg">{selectedTimeZone || initialTimeZone}</strong>
      </div>
      <button className="justify-self-start px-4 py-2" disabled={busy || !selectedTimeZone} type="submit">
        {busy ? "Speichere..." : "Zeitzone speichern"}
      </button>
      {message ? <div className="rounded-md border border-line bg-panel p-3 text-sm">{message}</div> : null}
    </form>
  );
}
