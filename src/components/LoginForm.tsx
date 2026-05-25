"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: form.get("identifier"), password: form.get("password") })
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Login fehlgeschlagen." }));
      setError(body.error || "Login fehlgeschlagen.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-lg border border-line bg-panel p-6">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      <label className="grid gap-1 text-sm font-semibold">
        Benutzername oder E-Mail
        <input name="identifier" type="text" autoComplete="username" required />
      </label>
      <label className="grid gap-1 text-sm font-semibold">
        Passwort
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      <button type="submit">Einloggen</button>
    </form>
  );
}
