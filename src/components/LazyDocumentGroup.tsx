"use client";

import { useEffect, useMemo, useState } from "react";
import { DeleteDocumentButton } from "@/components/DeleteDocumentButton";
import { DocumentAssignmentForm } from "@/components/DocumentAssignmentForm";
import { DocumentRenameForm } from "@/components/DocumentRenameForm";
import { DocumentThumbnail } from "@/components/DocumentThumbnail";

type Option = { id: string; label: string; propertyId?: string };

type LazyDocument = {
  id: string;
  title: string;
  filename: string;
  storagePath: string | null;
  mimeType: string;
  status: string;
  summary: string | null;
  tags: string[];
  propertyId: string | null;
  unitId: string | null;
  categoryId: string | null;
  property?: { id: string; name: string } | null;
  unit?: { id: string; unitNumber: string; property?: { id: string; name: string } | null } | null;
  category?: { id: string; group: string; name: string } | null;
};

type DocumentFolder = {
  categoryIds: string[];
  categoryId: string | null;
  categoryLabel: string;
  year: string;
  count: number;
  preview: string[];
  containsTarget?: boolean;
};

export function LazyDocumentGroup({
  group,
  isAdmin,
  properties,
  units,
  categories,
  targetDocumentId = ""
}: {
  group: { id: string; label: string; count: number; preview: string };
  isAdmin: boolean;
  properties: Option[];
  units: Option[];
  categories: Option[];
  targetDocumentId?: string;
}) {
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  async function loadFolders() {
    if (loading) return;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ folders: "1" });
    if (group.id === "general") params.set("unassigned", "1");
    else params.set("propertyId", group.id);
    if (targetDocumentId) params.set("targetDocumentId", targetDocumentId);
    const response = await fetch(`/api/documents?${params.toString()}`);
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Dokumente konnten nicht geladen werden." }));
      setError(body.error || "Dokumente konnten nicht geladen werden.");
      setLoading(false);
      return;
    }
    const body = await response.json();
    setFolders(body.folders || []);
    setLoaded(true);
    setLoading(false);
  }

  useEffect(() => {
    if (targetDocumentId && !loaded && !loading) void loadFolders();
  }, [targetDocumentId, loaded, loading]);

  return (
    <details
      className="group w-full overflow-hidden rounded-lg border border-line bg-white shadow-sm transition hover:border-accent/40 hover:shadow-md [&:not([open])>div]:hidden"
      open={Boolean(targetDocumentId)}
      onToggle={(event) => {
        if (event.currentTarget.open && !loaded) void loadFolders();
      }}
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 border-b border-line bg-gradient-to-r from-emerald-50 via-white to-sky-50 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-accent text-lg font-black leading-none text-white shadow-sm">
            <span className="transition-transform group-open:rotate-90">›</span>
          </span>
          <span className="min-w-0">
            <span className="block truncate text-lg font-bold">{group.label}</span>
            <span className="text-xs font-semibold text-muted">
              <span className="group-open:hidden">{group.preview || "Zum Anzeigen der Dokumente aufklappen"}</span>
              <span className="hidden group-open:inline">Dokumente werden geladen und angezeigt</span>
            </span>
          </span>
        </span>
        <span className="rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-muted shadow-sm">{group.count} Dokumente</span>
      </summary>
      <div className="grid gap-3 bg-white p-3">
        {loading && !folders.length ? <div className="rounded-md border border-dashed border-line p-4 text-sm text-muted">Ordner werden geladen ...</div> : null}
        {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div> : null}
        <CategoryFolderList categories={categories} folders={folders} groupId={group.id} isAdmin={isAdmin} properties={properties} targetDocumentId={targetDocumentId} units={units} />
        {loaded && !folders.length ? (
          <div className="rounded-md border border-dashed border-line p-4 text-sm text-muted">Keine Dokumente in dieser Gruppe.</div>
        ) : null}
      </div>
    </details>
  );
}

function CategoryFolderList({
  folders,
  groupId,
  isAdmin,
  properties,
  units,
  categories,
  targetDocumentId
}: {
  folders: DocumentFolder[];
  groupId: string;
  isAdmin: boolean;
  properties: Option[];
  units: Option[];
  categories: Option[];
  targetDocumentId: string;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, DocumentFolder[]>();
    folders.forEach((folder) => {
      const list = map.get(folder.categoryLabel) || [];
      list.push(folder);
      map.set(folder.categoryLabel, list);
    });
    return Array.from(map.entries()).map(([label, categoryFolders]) => ({
      label,
      count: categoryFolders.reduce((sum, folder) => sum + folder.count, 0),
      folders: categoryFolders.sort((a, b) => b.year.localeCompare(a.year, "de")),
      containsTarget: categoryFolders.some((folder) => folder.containsTarget)
    }));
  }, [folders]);

  return grouped.map((category) => {
    if (category.folders.length === 1) {
      const folder = category.folders[0];
      return (
        <DocumentFolderItem
          categories={categories}
          folder={folder}
          groupId={groupId}
          isAdmin={isAdmin}
          key={`${folder.categoryId || "__none__"}:${folder.year}`}
          properties={properties}
          targetDocumentId={targetDocumentId}
          units={units}
        />
      );
    }
    return (
      <details className="group/category overflow-hidden rounded-md border border-line bg-panel" key={category.label} open={category.containsTarget}>
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 bg-white px-3 py-3 [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 items-center gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-emerald-100 text-base font-black text-accent">
              <span className="transition-transform group-open/category:rotate-90">›</span>
            </span>
            <span className="min-w-0">
              <span className="block truncate font-bold">{category.label}</span>
              <span className="block truncate text-xs font-semibold text-muted">{category.folders.map((folder) => folder.year).join(" · ")}</span>
            </span>
          </span>
          <span className="rounded-full bg-panel px-3 py-1 text-xs font-semibold text-muted">{category.count} Dokumente</span>
        </summary>
        <div className="grid gap-3 border-t border-line p-3">
          {category.folders.map((folder) => (
            <DocumentFolderItem
              categories={categories}
              folder={folder}
              groupId={groupId}
              isAdmin={isAdmin}
              key={`${folder.categoryId || "__none__"}:${folder.year}`}
              properties={properties}
              targetDocumentId={targetDocumentId}
              units={units}
            />
          ))}
        </div>
      </details>
    );
  });
}

function DocumentFolderItem({
  folder,
  groupId,
  isAdmin,
  properties,
  units,
  categories,
  targetDocumentId
}: {
  folder: DocumentFolder;
  groupId: string;
  isAdmin: boolean;
  properties: Option[];
  units: Option[];
  categories: Option[];
  targetDocumentId: string;
}) {
  const [documents, setDocuments] = useState<LazyDocument[]>([]);
  const [page, setPage] = useState(1);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  async function loadDocuments(next = 1) {
    if (loading) return;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      page: String(next),
      limit: "40",
      categoryId: folder.categoryId || "__none__",
      categoryIds: folder.categoryIds.join(","),
      folderYear: folder.year
    });
    if (groupId === "general") params.set("unassigned", "1");
    else params.set("propertyId", groupId);
    const response = await fetch(`/api/documents?${params.toString()}`);
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Dokumente konnten nicht geladen werden." }));
      setError(body.error || "Dokumente konnten nicht geladen werden.");
      setLoading(false);
      return;
    }
    const body = await response.json();
    setDocuments((current) => next === 1 ? body.documents : [...current, ...body.documents]);
    setNextPage(body.nextPage);
    setPage(next);
    setLoaded(true);
    setLoading(false);
  }

  useEffect(() => {
    if (folder.containsTarget && targetDocumentId && !loaded && !loading) void loadDocuments(1);
  }, [folder.containsTarget, targetDocumentId, loaded, loading]);

  useEffect(() => {
    if (!targetDocumentId || !documents.some((doc) => doc.id === targetDocumentId)) return;
    window.setTimeout(() => {
      document.getElementById(`document-${targetDocumentId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
  }, [documents, targetDocumentId]);

  return (
    <details
      className="group/folder overflow-hidden rounded-md border border-line bg-panel"
      open={Boolean(folder.containsTarget)}
      onToggle={(event) => {
        if (event.currentTarget.open && !loaded) void loadDocuments(1);
      }}
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 bg-white px-3 py-3 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-sky-100 text-base font-black text-accent">
            <span className="transition-transform group-open/folder:rotate-90">›</span>
          </span>
          <span className="min-w-0">
            <span className="block truncate font-bold">{folder.categoryLabel}</span>
            <span className="block truncate text-xs font-semibold text-muted">{folder.year} · {folder.preview.join(" · ")}</span>
          </span>
        </span>
        <span className="rounded-full bg-panel px-3 py-1 text-xs font-semibold text-muted">{folder.count} Dokumente</span>
      </summary>
      <div className="grid gap-3 border-t border-line p-3">
        {loading && !documents.length ? <div className="rounded-md border border-dashed border-line bg-white p-4 text-sm text-muted">Dokumente werden geladen ...</div> : null}
        {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div> : null}
        {documents.map((doc) => (
          <div id={`document-${doc.id}`} className={`scroll-mt-24 grid w-full gap-3 rounded-md border p-3 text-sm md:grid-cols-[104px_minmax(0,1fr)] ${doc.id === targetDocumentId ? "border-accent bg-emerald-50/60 ring-2 ring-accent/20" : "border-line bg-white"}`} key={doc.id}>
            <DocumentThumbnail id={doc.id} title={doc.title} mimeType={doc.mimeType} hasFile={Boolean(doc.storagePath)} compact />
            <div className="min-w-0">
              <div className="break-words font-bold">{doc.title}</div>
              <div className="mt-1 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-panel px-2 py-1 font-semibold text-muted">{doc.status}</span>
                {doc.category ? <span className="rounded-full bg-panel px-2 py-1 font-semibold text-muted">{doc.category.group} / {doc.category.name}</span> : null}
              </div>
              <div className="mt-1 text-muted">{doc.unit ? `${doc.unit.property?.name || doc.property?.name || "Immobilie"} / ${doc.unit.unitNumber}` : doc.property?.name || "Allgemein"}</div>
              {doc.summary ? <div className="mt-2 rounded-md bg-panel px-3 py-2 text-sm text-muted">{doc.summary}</div> : null}
              {doc.tags?.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {doc.tags.slice(0, 8).map((tag) => (
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-accent" key={tag}>{tag}</span>
                  ))}
                </div>
              ) : null}
              {isAdmin ? (
                <>
                  <DocumentRenameForm documentId={doc.id} filename={doc.filename} title={doc.title} />
                  <DocumentAssignmentForm
                    documentId={doc.id}
                    propertyId={doc.propertyId || ""}
                    unitId={doc.unitId || ""}
                    categoryId={doc.categoryId || ""}
                    properties={properties}
                    units={units}
                    categories={categories}
                  />
                </>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {doc.storagePath ? (
                  <a className="button px-3 py-2 text-sm" href={`/api/documents/${doc.id}/download`}>Download</a>
                ) : (
                  <span className="rounded-md border border-line bg-white px-3 py-2 text-sm text-muted">Keine Datei</span>
                )}
                {isAdmin ? <DeleteDocumentButton documentId={doc.id} /> : null}
              </div>
            </div>
          </div>
        ))}
        {nextPage ? (
          <button className="button-secondary justify-self-start px-3 py-2 text-sm" disabled={loading} onClick={() => loadDocuments(page + 1)} type="button">
            {loading ? "Lade ..." : "Weitere Dokumente laden"}
          </button>
        ) : null}
      </div>
    </details>
  );
}
