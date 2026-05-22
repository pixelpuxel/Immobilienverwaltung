import { Role } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { DeleteDocumentButton } from "@/components/DeleteDocumentButton";
import { DocumentAssignmentForm } from "@/components/DocumentAssignmentForm";
import { DocumentThumbnail } from "@/components/DocumentThumbnail";
import { UploadForm } from "@/components/UploadForm";
import { requireUser } from "@/lib/auth";
import { brokerPropertyIds, tenantUnitId } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const user = await requireUser();
  const [properties, units, categories] = await Promise.all([
    prisma.property.findMany({ orderBy: { name: "asc" } }),
    prisma.unit.findMany({ include: { property: true }, orderBy: [{ property: { name: "asc" } }, { unitNumber: "asc" }] }),
    prisma.documentCategory.findMany({ orderBy: [{ group: "asc" }, { name: "asc" }] })
  ]);
  const propertyOptions = properties.map((property) => ({ id: property.id, label: property.name }));
  const unitOptions = units.map((unit) => ({ id: unit.id, propertyId: unit.propertyId, label: `${unit.property.name} / ${unit.unitNumber}` }));
  const categoryOptions = categories.map((category) => ({ id: category.id, label: `${category.group} / ${category.name}` }));
  const documentInclude = { property: true, unit: { include: { property: true } }, category: true } as const;
  const documents = user.role === Role.ADMIN
    ? await prisma.document.findMany({ include: documentInclude, orderBy: { createdAt: "desc" } })
    : user.role === Role.BROKER
      ? await prisma.document.findMany({
          where: { propertyId: { in: await brokerPropertyIds(user.id) }, permissions: { some: { userId: user.id, canView: true } } },
          include: documentInclude,
          orderBy: { createdAt: "desc" }
        })
      : await prisma.document.findMany({
          where: { OR: [{ unitId: await tenantUnitId(user.id) }, { permissions: { some: { userId: user.id, canView: true } } }] },
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
            <section className="w-full overflow-hidden rounded-lg border border-line" key={group.id}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-panel px-4 py-3">
                <h2 className="text-lg font-bold">{group.label}</h2>
                <span className="rounded-full bg-white px-3 py-1 text-xs text-muted">{group.documents.length} Dokumente</span>
              </div>
              {group.documents.map((doc) => (
                <div className="grid w-full gap-3 border-b border-line p-4 text-sm last:border-b-0 md:grid-cols-[120px_minmax(0,1fr)_150px_140px]" key={doc.id}>
                  <DocumentThumbnail id={doc.id} title={doc.title} mimeType={doc.mimeType} hasFile={Boolean(doc.storagePath)} compact />
                  <div>
                    <div className="font-bold">{doc.title}</div>
                    <div className="text-muted">{doc.category?.group} / {doc.category?.name}</div>
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
                  </div>
                  <div>{doc.status}</div>
                  <div className="grid gap-2">
                    {doc.storagePath ? (
                      <a className="button block text-center" href={`/api/documents/${doc.id}/download`}>Download</a>
                    ) : (
                      <span className="rounded-md border border-line bg-panel px-3 py-2 text-center text-muted">Keine Datei</span>
                    )}
                    {user.role === Role.ADMIN ? <DeleteDocumentButton documentId={doc.id} /> : null}
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
        {user.role === Role.ADMIN ? (
          <UploadForm endpoint="/api/documents">
            <label>Titel<input name="title" /></label>
            <label>Immobilie<select name="propertyId"><option value="">Keine</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label>Kategorie<select name="categoryId"><option value="">Keine</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.group} / {c.name}</option>)}</select></label>
            <label>Status<select name="status"><option value="AVAILABLE">vorhanden</option><option value="REQUESTED">angefragt</option><option value="SHARED">freigegeben</option><option value="MISSING">fehlt</option><option value="NOT_RELEVANT">nicht relevant</option></select></label>
          </UploadForm>
        ) : null}
      </div>
    </AppShell>
  );
}
