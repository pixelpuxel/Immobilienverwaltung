"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { reloadCurrentView } from "@/lib/client-refresh";

export function TaxAdvisorCreateForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/tax-advisors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: String(form.get("email") || ""),
        username: String(form.get("username") || ""),
        name: String(form.get("name") || ""),
        password: String(form.get("password") || "")
      })
    });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Steuerberater konnte nicht angelegt werden." }));
      setMessage(body.error || "Steuerberater konnte nicht angelegt werden.");
      return;
    }
    event.currentTarget.reset();
    setMessage("Steuerberater angelegt. Dokumente können jetzt einzeln freigegeben werden.");
    reloadCurrentView(router);
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-lg border border-line bg-panel p-4">
      {message ? <div className="rounded-md border border-line bg-white p-3 text-sm">{message}</div> : null}
      <h2 className="text-xl font-bold">Steuerberater anlegen</h2>
      <p className="text-sm text-muted">Dieser Zugang sieht nur Dokumente, die einzeln freigegeben wurden.</p>
      <label>Benutzername<input name="username" /></label>
      <label>E-Mail<input name="email" type="email" /></label>
      <label>Name<input name="name" /></label>
      <label>Passwort<input name="password" type="text" defaultValue="BitteSofortAendern123!" /></label>
      <button type="submit" disabled={busy}>{busy ? "Legt an..." : "Steuerberater anlegen"}</button>
    </form>
  );
}
