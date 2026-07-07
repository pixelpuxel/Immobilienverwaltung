"use client";

import { useState } from "react";

type ShareFile = {
  id: string;
  filename: string;
  size: number;
  downloadCount: number;
  lastDownloadedAt: string | null;
};

type PublicShare = {
  id: string;
  name: string;
  description: string | null;
  url: string;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  files: ShareFile[];
};

export function PublicShareManager({ initialShares }: { initialShares: PublicShare[] }) {
  const [shares, setShares] = useState(initialShares);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function createShare(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    const response = await fetch("/api/public-shares", {
      method: "POST",
      body: new FormData(event.currentTarget)
    });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Freigabe konnte nicht erstellt werden." }));
      setMessage(body.error || "Freigabe konnte nicht erstellt werden.");
      return;
    }
    const body = await response.json();
    setShares((current) => [body.share, ...current]);
    setMessage("Freigabe erstellt. Link kann jetzt weitergegeben werden.");
    event.currentTarget.reset();
  }

  async function revoke(id: string) {
    if (!window.confirm("Diese Freigabe deaktivieren? Der Link funktioniert danach nicht mehr.")) return;
    const response = await fetch(`/api/public-shares/${id}`, { method: "PATCH" });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Freigabe konnte nicht deaktiviert werden." }));
      setMessage(body.error || "Freigabe konnte nicht deaktiviert werden.");
      return;
    }
    setShares((current) => current.map((share) => share.id === id ? { ...share, revokedAt: new Date().toISOString() } : share));
  }

  async function remove(id: string) {
    if (!window.confirm("Freigabe endgültig löschen? Direkt hochgeladene Freigabe-Dateien werden vom Server entfernt.")) return;
    const response = await fetch(`/api/public-shares/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Freigabe konnte nicht geloescht werden." }));
      setMessage(body.error || "Freigabe konnte nicht geloescht werden.");
      return;
    }
    setShares((current) => current.filter((share) => share.id !== id));
    setMessage("Freigabe geloescht und zugehoerige Upload-Dateien entfernt.");
  }

  async function copyLink(url: string) {
    await navigator.clipboard.writeText(url);
    setMessage("Link kopiert.");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
      <form className="grid content-start gap-3 rounded-lg border border-line bg-panel p-4" onSubmit={createShare}>
        <h2 className="text-xl font-bold">Neue geschützte Freigabe</h2>
        <p className="text-sm text-muted">Erzeugt einen langen, geheimen Link. Kein Login nötig, aber nur Personen mit diesem Link kommen an die Dateien.</p>
        <label>Name<input name="name" placeholder="z.B. Steuerberater Unterlagen Juli" required /></label>
        <label>Beschreibung<textarea name="description" rows={4} placeholder="Kurze Nachricht oder Hinweise für den Empfänger" /></label>
        <label>
          Gültig für
          <select name="expiresDays" defaultValue="14">
            <option value="1">1 Tag</option>
            <option value="7">7 Tage</option>
            <option value="14">14 Tage</option>
            <option value="30">30 Tage</option>
            <option value="90">90 Tage</option>
          </select>
        </label>
        <label>
          Dateien
          <input name="file" type="file" multiple required />
        </label>
        {message ? <div className="rounded-md bg-white p-3 text-sm text-muted">{message}</div> : null}
        <button type="submit" disabled={busy}>{busy ? "Erstellt..." : "Freigabelink erstellen"}</button>
      </form>
      <div className="grid gap-4 content-start">
        {shares.map((share) => {
          const disabled = Boolean(share.revokedAt || (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()));
          return (
            <section className={`overflow-hidden rounded-lg border border-line bg-white shadow-sm ${disabled ? "opacity-70" : ""}`} key={share.id}>
              <div className="grid gap-3 border-b border-line bg-gradient-to-r from-emerald-50 via-white to-sky-50 p-4 md:grid-cols-[minmax(0,1fr)_auto]">
                <div>
                  <h3 className="text-lg font-bold">{share.name}</h3>
                  <p className="mt-1 text-sm text-muted">{share.description || "Keine Beschreibung."}</p>
                  <div className="mt-2 text-xs text-muted">
                    Erstellt {formatDate(share.createdAt)} · {share.expiresAt ? `gültig bis ${formatDate(share.expiresAt)}` : "ohne Ablauf"} {share.revokedAt ? "· deaktiviert" : ""}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:justify-end">
                  <button className="button-secondary flex min-h-10 items-center justify-center px-3 py-2 text-center text-sm" onClick={() => copyLink(share.url)} type="button">Link kopieren</button>
                  <a className="button flex min-h-10 items-center justify-center px-3 py-2 text-center text-sm" href={share.url} target="_blank">Öffnen</a>
                  {!share.revokedAt ? <button className="button-secondary flex min-h-10 items-center justify-center px-3 py-2 text-center text-sm" onClick={() => revoke(share.id)} type="button">Deaktivieren</button> : null}
                  <button className="button-danger flex min-h-10 items-center justify-center px-3 py-2 text-center text-sm" onClick={() => remove(share.id)} type="button">Loeschen</button>
                </div>
              </div>
              <div className="divide-y divide-line">
                {share.files.map((file) => (
                  <div className="grid gap-2 p-4 text-sm md:grid-cols-[minmax(0,1fr)_160px]" key={file.id}>
                    <div>
                      <div className="break-words font-bold">{file.filename}</div>
                      <div className="text-xs text-muted">{formatBytes(file.size)} · {file.downloadCount} Downloads{file.lastDownloadedAt ? ` · zuletzt ${formatDate(file.lastDownloadedAt)}` : ""}</div>
                    </div>
                    <a className="button-secondary px-3 py-2 text-center text-sm" href={`/api/public-shares/public/${share.url.split("/").pop()}/files/${file.id}`} target="_blank">Test-Download</a>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
        {!shares.length ? <div className="rounded-lg border border-dashed border-line bg-white p-6 text-sm text-muted">Noch keine Freigaben erstellt.</div> : null}
      </div>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatBytes(value: number) {
  if (value > 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value > 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}
