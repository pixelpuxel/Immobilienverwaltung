"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function BackupTools() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  async function importBackup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsImporting(true);
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/backup/import", {
        method: "POST",
        body: form
      });
      const text = await response.text();
      const body = text ? JSON.parse(text) : {};

      if (!response.ok) {
        setMessage(body.error || `Import fehlgeschlagen (${response.status}).`);
        return;
      }

      const summary = body.summary
        ? ` ${body.summary.records} Datensätze und ${body.summary.files} Dateien übernommen.`
        : "";
      setMessage(`Import abgeschlossen.${summary}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import fehlgeschlagen.");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <section className="rounded-lg border border-line bg-panel p-4">
      <h2 className="text-xl font-bold">Backup und Import</h2>
      <p className="mt-2 text-sm text-muted">
        Exportiert alle Tabellen in eine lesbare JSON-Datei. Dokumente, Vertragsvorlagen und erzeugte Verträge können optional direkt eingebettet werden.
      </p>
      <div className="mt-4 grid gap-5">
        <form className="grid gap-3 rounded-lg border border-line bg-white p-3" action="/api/backup/export" method="get">
          <label className="flex items-start gap-3 text-sm font-semibold">
            <input className="mt-1" name="includeFiles" type="checkbox" value="true" defaultChecked />
            <span>
              Dokumente und Vertragsdateien einschließen
              <span className="block text-xs font-normal text-muted">
                Macht die Datei größer, enthält dafür aber Uploads, Vorlagen, DOCX/PDF-Verträge und Prüfsummen.
              </span>
            </span>
          </label>
          <button className="button" type="submit">Backup exportieren</button>
        </form>

        <form className="grid gap-3 rounded-lg border border-line bg-white p-3" onSubmit={importBackup}>
          <label className="grid gap-1 text-sm font-semibold text-muted">
            Backup-Datei importieren
            <input name="file" type="file" accept="application/json,.json" required />
          </label>
          <label className="flex items-start gap-3 text-sm font-semibold">
            <input className="mt-1" name="replaceExisting" type="checkbox" value="true" defaultChecked />
            <span>
              Vorhandene Daten vor dem Import ersetzen
              <span className="block text-xs font-normal text-muted">
                Für vollständige Wiederherstellungen empfohlen. Ohne Haken werden Datensätze anhand ihrer IDs ergänzt oder aktualisiert.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm font-semibold">
            <input className="mt-1" name="importFiles" type="checkbox" value="true" defaultChecked />
            <span>
              Enthaltene Dokumentdateien importieren
              <span className="block text-xs font-normal text-muted">
                Schreibt Uploads, Vertragsvorlagen und erzeugte Verträge an die im Backup gespeicherten Pfade.
              </span>
            </span>
          </label>
          <button className="button-secondary" type="submit" disabled={isImporting}>
            {isImporting ? "Import laeuft..." : "Backup importieren"}
          </button>
        </form>
        {message ? <div className="rounded-md border border-line bg-white p-3 text-sm">{message}</div> : null}
      </div>
    </section>
  );
}
