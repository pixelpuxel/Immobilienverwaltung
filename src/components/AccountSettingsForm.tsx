"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { refreshCurrentView } from "@/lib/client-refresh";

type AccountProfile = {
  email: string;
  username: string | null;
};

export function AccountSettingsForm({ userId, profile }: { userId: string; profile: AccountProfile }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    const password = String(formData.get("password") || "");
    const passwordConfirm = String(formData.get("passwordConfirm") || "");

    if (password && password !== passwordConfirm) {
      setError("Die beiden Passwoerter stimmen nicht ueberein.");
      return;
    }

    const payload: Record<string, string> = {
      email: String(formData.get("email") || ""),
      username: String(formData.get("username") || "")
    };
    if (password) payload.password = password;

    const response = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error || "Zugangsdaten konnten nicht gespeichert werden.");
      return;
    }

    const passwordInput = form.elements.namedItem("password") as HTMLInputElement | null;
    const confirmInput = form.elements.namedItem("passwordConfirm") as HTMLInputElement | null;
    if (passwordInput) passwordInput.value = "";
    if (confirmInput) confirmInput.value = "";
    setMessage(password ? "Zugangsdaten und Passwort gespeichert." : "Zugangsdaten gespeichert.");
    refreshCurrentView(router);
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-lg border border-line bg-white p-4 shadow-sm">
      <div>
        <h2 className="text-xl font-bold">Login und Passwort</h2>
        <p className="mt-1 text-sm text-muted">Diese Daten verwendest du zum Einloggen. Der Benutzername ist optional, die E-Mail bleibt immer als Login moeglich.</p>
      </div>
      {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div> : null}
      {error ? <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div> : null}
      <label>Login-E-Mail<input name="email" type="email" defaultValue={profile.email} required /></label>
      <label>Benutzername<input name="username" defaultValue={profile.username || ""} placeholder="optional" /></label>
      <div className="rounded-md border border-line bg-panel p-3">
        <div className="text-sm font-semibold">Passwort ändern</div>
        <p className="mt-1 text-xs text-muted">Leer lassen, wenn das aktuelle Passwort bleiben soll.</p>
        <div className="mt-3 grid gap-3">
          <label>Neues Passwort<input name="password" type="password" autoComplete="new-password" minLength={8} /></label>
          <label>Neues Passwort wiederholen<input name="passwordConfirm" type="password" autoComplete="new-password" minLength={8} /></label>
        </div>
      </div>
      <button type="submit">Login-Daten speichern</button>
    </form>
  );
}
