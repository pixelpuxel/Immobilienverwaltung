import { Role } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { DeleteDocumentButton } from "@/components/DeleteDocumentButton";
import { DocumentAssignmentForm } from "@/components/DocumentAssignmentForm";
import { DocumentThumbnail } from "@/components/DocumentThumbnail";
import { UploadForm } from "@/components/UploadForm";
import { requireUser } from "@/lib/auth";
import { brokerPropertyIds, tenantUnitId } from "@/lib/permissions";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DocumentsPage({ searchParams }: { searchParams?: { propertyId?: string; unitId?: string; category?: string } }) {
  const user = await requireUser();
  const [properties, units, categories] = await Promise.all([
    prisma.property.findMany({ where: portalWhere(user), orderBy: { name: "asc" } }),
    prisma.unit.findMany({ where: { property: portalWhere(user) }, include: { property: true }, orderBy: [{ property: { name: "asc" } }, { unitNumber: "asc" }] }),
    prisma.documentCategory.findMany({ orderBy: [{ group: "asc" }, { name: "asc" }] })
  ]);
  const propertyOptions = properties.map((property) => ({ id: property.id, label: property.name }));
  const unitOptions = units.map((unit) => ({ id: unit.id, propertyId: unit.propertyId, label: `${unit.property.name} / ${unit.unitNumber}` }));
  const categoryOptions = categories.map((category) => ({ id: category.id, label: `${category.group} / ${category.name}` }));
  const defaultPropertyId = searchParams?.propertyId || "";
  const defaultUnitId = searchParams?.unitId || "";
  const defaultCategoryId = searchParams?.category === "nebenkosten"
    ? categories.find((category) => category.name === "Nebenkostenabrechnungen")?.id || ""
    : "";
  const documentInclude = { property: true, unit: { include: { property: true } }, category: true } as const;
  const documents = user.role === Role.ADMIN
    ? await prisma.document.findMany({ where: portalWhere(user), include: documentInclude, orderBy: { createdAt: "desc" } })
    : user.role === Role.BROKER
      ? await prisma.document.findMany({
          where: { propertyId: { in: await brokerPropertyIds(user.id) }, ...portalWhere(user), category: { visibleToBroker: true }, permissions: { some: { userId: user.id, canView: true } } },
          include: documentInclude,
          orderBy: { createdAt: "desc" }
        })
      : await prisma.document.findMany({
          where: {
            OR: [
              { permissions: { some: { userId: user.id, canView: true } } },
              { unitId: await tenantUnitId(user.id), category: { visibleToTenant: true }, scope: { in: ["UNIT", "CONTRACT"] } }
            ]
          },
          include: documentInclude,
          orderBy: { createdAt: "desc" }
        });
  const groupedDocuments = documents.reduce<Array<{ id: string; label: string; documents: typeof documents }>>((groups, document) => {
    const property = document.property || document.unit?.property;
    const id = property?.id || "general";
    const label = property?.name || "Allgemein / ohne Objekt";
    const group = groups.find((item) => item.id === id);
    if (group) {
      group.documents.push(document);
    } else {
      groups.push({ id, label, documents: [document] });
    }
    return groups;
  }, []);
  return (
    <AppShell role={user.role} userId={user.id} email={user.email} canSwitchView={user.role === Role.ADMIN || Boolean(user.impersonatedByAdminId)}>
      <h1 className="text-3xl font-bold">Dokumentenverwaltung</h1>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_420px]">
        <div className="grid w-full gap-5">
          {groupedDocuments.map((group) => (
            <details className="group w-full overflow-hidden rounded-lg border border-line bg-white shadow-sm transition hover:border-accent/40 hover:shadow-md [&:not([open])>div]:hidden" key={group.id}>
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 border-b border-line bg-gradient-to-r from-emerald-50 via-white to-sky-50 px-4 py-3">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-accent text-lg font-black leading-none text-white shadow-sm">
                    <span className="transition-transform group-open:rotate-90">›</span>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-lg font-bold">{group.label}</span>
                    <span className="text-xs font-semibold text-muted">
                      <span className="group-open:hidden">{group.documents.map((document) => document.category?.name || document.title).slice(0, 3).join(" · ")}</span>
                      <span className="hidden group-open:inline">Dokumente werden angezeigt</span>
                    </span>
                  </span>
                </span>
                <span className="rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-muted shadow-sm">{group.documents.length} Dokumente</span>
              </summary>
              <div className="grid gap-3 bg-white p-3">
              {group.documents.map((doc) => (
                <div className="grid w-full gap-3 rounded-md border border-line bg-panel p-3 text-sm md:grid-cols-[104px_minmax(0,1fr)]" key={doc.id}>
                  <DocumentThumbnail id={doc.id} title={doc.title} mimeType={doc.mimeType} hasFile={Boolean(doc.storagePath)} compact />
                  <div className="min-w-0">
                    <div className="break-words font-bold">{doc.title}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-white px-2 py-1 font-semibold text-muted">{doc.status}</span>
                      {doc.category ? <span className="rounded-full bg-white px-2 py-1 font-semibold text-muted">{doc.category.group} / {doc.category.name}</span> : null}
                    </div>
                    <div className="mt-1 text-muted">{doc.unit ? `${doc.unit.property.name} / ${doc.unit.unitNumber}` : doc.property?.name || "Allgemein"}</div>
                    {user.role === Role.ADMIN ? (
                      <DocumentAssignmentForm
                        documentId={doc.id}
                        propertyId={doc.propertyId || ""}
                        unitId={doc.unitId || ""}
                        categoryId={doc.categoryId || ""}
                        properties={propertyOptions}
                        units={unitOptions}
                        categories={categoryOptions}
                      />
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {doc.storagePath ? (
                        <a className="button px-3 py-2 text-sm" href={`/api/documents/${doc.id}/download`}>Download</a>
                      ) : (
                        <span className="rounded-md border border-line bg-white px-3 py-2 text-sm text-muted">Keine Datei</span>
                      )}
                      {user.role === Role.ADMIN ? <DeleteDocumentButton documentId={doc.id} /> : null}
                    </div>
                  </div>
                </div>
              ))}
              </div>
            </details>
          ))}
        </div>
        {user.role === Role.ADMIN ? (
          <UploadForm endpoint="/api/documents">
            <label>Titel<input name="title" /></label>
            <label>Immobilie<select name="propertyId" defaultValue={defaultPropertyId}><option value="">Keine</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label>Einheit<select name="unitId" defaultValue={defaultUnitId}><option value="">Keine</option>{units.map((u) => <option key={u.id} value={u.id}>{u.property.name} / {u.unitNumber}</option>)}</select></label>
            <label>Kategorie<select name="categoryId" defaultValue={defaultCategoryId}><option value="">Keine</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.group} / {c.name}</option>)}</select></label>
            <label>Status<select name="status"><option value="AVAILABLE">vorhanden</option><option value="REQUESTED">angefragt</option><option value="SHARED">freigegeben</option><option value="MISSING">fehlt</option><option value="NOT_RELEVANT">nicht relevant</option></select></label>
          </UploadForm>
        ) : null}
      </div>
    </AppShell>
  );
}
