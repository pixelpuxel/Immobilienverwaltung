"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

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
    <form onSubmit={submit} className="grid gap-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      <label className="grid gap-1 text-sm font-semibold">
        Benutzername oder E-Mail
        <input name="identifier" type="text" autoComplete="username" required />
      </label>
      <label className="grid gap-1 text-sm font-semibold">
        Passwort
        <span className="relative block">
          <input className="pr-12" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required />
          <button
            aria-label={showPassword ? "Passwort verbergen" : "Passwort anzeigen"}
            className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md border border-transparent bg-transparent p-0 text-muted hover:border-line hover:bg-panel focus:outline-none focus:ring-2 focus:ring-accent/40"
            onClick={() => setShowPassword((visible) => !visible)}
            type="button"
          >
            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </span>
      </label>
      <button type="submit">Einloggen</button>
    </form>
  );
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path d="m3 3 18 18" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <path d="M10.6 10.6A2 2 0 0 0 13.4 13.4" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6 0 9.5 7 9.5 7a15 15 0 0 1-3.1 4.1" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M6.6 6.7C3.9 8.5 2.5 12 2.5 12s3.5 7 9.5 7c1.6 0 3-.4 4.2-1" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}
