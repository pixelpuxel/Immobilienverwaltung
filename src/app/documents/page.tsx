import { DocumentScope, Prisma, Role } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { LazyDocumentGroup } from "@/components/LazyDocumentGroup";
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
  const propertyIds = user.role === Role.BROKER ? await brokerPropertyIds(user.id) : [];
  const unitId = user.role === Role.TENANT ? await tenantUnitId(user.id) : null;
  const documentWhere: Prisma.DocumentWhereInput = user.role === Role.ADMIN
    ? portalWhere(user)
    : user.role === Role.BROKER
      ? { propertyId: { in: propertyIds }, ...portalWhere(user), category: { visibleToBroker: true }, permissions: { some: { userId: user.id, canView: true } } }
      : {
          ...portalWhere(user),
          OR: [
            { permissions: { some: { userId: user.id, canView: true } } },
            { unitId, category: { visibleToTenant: true }, scope: { in: [DocumentScope.UNIT, DocumentScope.CONTRACT] } }
          ]
        };
  const scopedProperties = user.role === Role.BROKER
    ? properties.filter((property) => propertyIds.includes(property.id))
    : properties;
  const [propertyGroups, generalCount, generalPreview] = await Promise.all([
    Promise.all(scopedProperties.map(async (property) => {
      const propertyWhere: Prisma.DocumentWhereInput = { AND: [documentWhere, { OR: [{ propertyId: property.id }, { unit: { propertyId: property.id } }] }] };
      const [count, previewRows] = await Promise.all([
        prisma.document.count({ where: propertyWhere }),
        prisma.document.findMany({
          where: propertyWhere,
          select: { title: true, category: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 3
        })
      ]);
      return {
        id: property.id,
        label: property.name,
        count,
        preview: previewRows.map((document) => document.category?.name || document.title).join(" · ")
      };
    })),
    prisma.document.count({ where: { AND: [documentWhere, { propertyId: null, unitId: null }] } }),
    prisma.document.findMany({
      where: { AND: [documentWhere, { propertyId: null, unitId: null }] },
      select: { title: true, category: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 3
    })
  ]);
  const groupedDocuments = [
    ...propertyGroups,
    {
      id: "general",
      label: "Allgemein / ohne Objekt",
      count: generalCount,
      preview: generalPreview.map((document) => document.category?.name || document.title).join(" · ")
    }
  ]
    .filter((group) => group.count > 0)
    .sort((a, b) => a.label.localeCompare(b.label, "de"));
  return (
    <AppShell role={user.role} userId={user.id} email={user.email} canSwitchView={user.role === Role.ADMIN || Boolean(user.impersonatedByAdminId)}>
      <h1 className="text-3xl font-bold">Dokumentenverwaltung</h1>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_420px]">
        <div className="grid w-full gap-5">
          {groupedDocuments.map((group) => (
            <LazyDocumentGroup
              categories={categoryOptions}
              group={group}
              isAdmin={user.role === Role.ADMIN}
              key={group.id}
              properties={propertyOptions}
              units={unitOptions}
            />
          ))}
          {groupedDocuments.length ? null : <div className="rounded-lg border border-dashed border-line bg-white p-6 text-sm text-muted">Noch keine Dokumente vorhanden.</div>}
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
