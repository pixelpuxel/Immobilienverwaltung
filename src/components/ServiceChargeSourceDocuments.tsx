import { DocumentThumbnail } from "@/components/DocumentThumbnail";
import { UploadForm } from "@/components/UploadForm";

type SourceDocument = {
  id: string;
  title: string;
  filename: string;
  mimeType: string;
  hasFile: boolean;
  createdAt: string;
};

export function ServiceChargeSourceDocuments({
  propertyId,
  year,
  categoryId,
  documents
}: {
  propertyId: string;
  year: number;
  categoryId: string | null;
  documents: SourceDocument[];
}) {
  return (
    <section className="mb-6 border-y border-line py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold uppercase text-accent">Quelldokument {year}</div>
          <h3 className="mt-1 text-lg font-bold">Hausgeldabrechnung</h3>
          <p className="mt-1 text-sm text-muted">Die Abrechnung der Hausverwaltung bleibt als Beleg mit Immobilie und Abrechnungsjahr verknuepft.</p>
        </div>
        {documents.length ? (
          <span className="rounded-full bg-panel px-3 py-1 text-sm font-semibold">{documents.length} Datei{documents.length === 1 ? "" : "en"}</span>
        ) : null}
      </div>

      {documents.length ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {documents.map((document) => (
            <article className="flex min-w-0 gap-3 rounded-md border border-line bg-panel p-3" key={document.id}>
              <DocumentThumbnail
                id={document.id}
                title={document.title}
                mimeType={document.mimeType}
                hasFile={document.hasFile}
                compact
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{document.title}</div>
                <div className="mt-1 truncate text-xs text-muted">{document.filename}</div>
                <div className="mt-1 text-xs text-muted">Hochgeladen am {formatDate(document.createdAt)}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a className="button button-secondary px-3 py-2 text-sm" href={`/api/documents/${document.id}/preview`} rel="noreferrer" target="_blank">Vorschau</a>
                  <a className="button button-secondary px-3 py-2 text-sm" href={`/api/documents/${document.id}/download`}>Herunterladen</a>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-md border border-dashed border-line bg-panel p-4 text-sm text-muted">
          Fuer diese Immobilie und diesen Zeitraum ist noch keine Hausgeldabrechnung hinterlegt.
        </div>
      )}

      <div className="mt-4 max-w-2xl">
        {categoryId ? (
          <UploadForm endpoint="/api/documents" submitLabel="Hausgeldabrechnung hochladen" multiple={false}>
            <input name="propertyId" type="hidden" value={propertyId} />
            <input name="categoryId" type="hidden" value={categoryId} />
            <input name="documentYear" type="hidden" value={year} />
            <input name="scope" type="hidden" value="PROPERTY" />
            <input name="status" type="hidden" value="AVAILABLE" />
            <label className="grid gap-1 text-sm font-semibold">
              Bezeichnung
              <input name="title" defaultValue={`Hausgeldabrechnung ${year}`} />
            </label>
          </UploadForm>
        ) : (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Die Dokumentkategorie Hausgeldabrechnungen fehlt. Bitte die Kategorien in den Einstellungen initialisieren.
          </div>
        )}
      </div>
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(value));
}
