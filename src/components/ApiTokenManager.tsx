"use client";

import { useState } from "react";

const scopeGroups = [
  ["Lesen", ["read:properties", "read:units", "read:documents", "download:documents", "read:tenants", "read:contracts"]],
  ["Schreiben", ["write:properties", "write:units", "write:documents", "write:tenants"]],
  ["Backup", ["backup:export", "backup:import"]]
];

type ApiTokenRow = {
  id: string;
  name: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export function ApiTokenManager({ initialTokens }: { initialTokens: ApiTokenRow[] }) {
  const [tokens, setTokens] = useState(initialTokens);
  const [plainToken, setPlainToken] = useState("");
  const [message, setMessage] = useState("");

  async function createToken(formData: FormData) {
    setMessage("");
    setPlainToken("");
    const scopes = formData.getAll("scopes").map(String);
    const response = await fetch("/api/api-tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(formData.get("name") || "N8N"),
        scopes,
        expiresAt: String(formData.get("expiresAt") || "") ? new Date(String(formData.get("expiresAt"))).toISOString() : null
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(body.error || "Token konnte nicht erstellt werden.");
      return;
    }
    setPlainToken(body.token);
    const list = await fetch("/api/api-tokens").then((result) => result.json());
    setTokens(list);
  }

  async function revokeToken(id: string) {
    setMessage("");
    const response = await fetch(`/api/api-tokens/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setMessage(body.error || "Token konnte nicht widerrufen werden.");
      return;
    }
    setTokens((current) => current.map((token) => token.id === id ? { ...token, revokedAt: new Date().toISOString() } : token));
  }

  return (
    <section className="rounded-lg border border-line bg-white">
      <div className="border-b border-line p-4">
        <div className="font-bold">N8N API-Tokens</div>
        <p className="mt-1 text-sm text-muted">Erstelle Bearer Tokens fuer N8N. Der Token wird nur einmal angezeigt.</p>
      </div>
      <form action={createToken} className="grid gap-4 p-4">
        <label className="grid gap-1 text-sm font-semibold">
          Name
          <input name="name" placeholder="n8n produktiv" required />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Ablaufdatum optional
          <input name="expiresAt" type="datetime-local" />
        </label>
        <div className="grid gap-3">
          {scopeGroups.map(([label, scopes]) => (
            <fieldset className="rounded-md border border-line p-3" key={label as string}>
              <legend className="px-1 text-xs font-bold uppercase text-muted">{label}</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {(scopes as string[]).map((scope) => (
                  <label className="flex items-center gap-2 text-sm" key={scope}>
                    <input className="h-4 w-4" name="scopes" type="checkbox" value={scope} />
                    <span className="font-mono text-xs">{scope}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        <button type="submit">Token erstellen</button>
      </form>
      {plainToken ? (
        <div className="border-t border-line bg-amber-50 p-4">
          <div className="font-bold text-amber-900">Token jetzt kopieren</div>
          <p className="mt-1 text-sm text-amber-900">Dieser Klartext wird danach nicht mehr angezeigt.</p>
          <code className="mt-3 block overflow-auto rounded-md bg-white p-3 text-xs">{plainToken}</code>
        </div>
      ) : null}
      {message ? <div className="border-t border-line p-4 text-sm font-semibold text-red-700">{message}</div> : null}
      <div className="divide-y divide-line border-t border-line">
        {tokens.length ? tokens.map((token) => (
          <div className="grid gap-2 p-4 text-sm" key={token.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-bold">{token.name}</div>
                <div className="text-xs text-muted">Erstellt: {formatDate(token.createdAt)} · Zuletzt: {token.lastUsedAt ? formatDate(token.lastUsedAt) : "nie"}</div>
              </div>
              {token.revokedAt ? (
                <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700">widerrufen</span>
              ) : (
                <button className="button-secondary px-3 py-2 text-sm" onClick={() => revokeToken(token.id)} type="button">Widerrufen</button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {token.scopes.map((scope) => <span className="rounded-full bg-panel px-2 py-1 font-mono text-[11px] text-muted" key={scope}>{scope}</span>)}
            </div>
          </div>
        )) : <div className="p-4 text-sm text-muted">Noch keine API-Tokens angelegt.</div>}
      </div>
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

