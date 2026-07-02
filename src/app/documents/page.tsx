import { DocumentScope, Prisma, Role } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { DocumentExportManager } from "@/components/DocumentExportManager";
import { DocumentUploadPanel } from "@/components/DocumentUploadPanel";
import { LazyDocumentGroup } from "@/components/LazyDocumentGroup";
import { requireUser } from "@/lib/auth";
import { brokerPropertyIds, tenantUnitId } from "@/lib/permissions";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DocumentsPage({ searchParams }: { searchParams?: { propertyId?: string; unitId?: string; category?: string; documentId?: string; tenantId?: string } }) {
  const user = await requireUser();
  const [properties, units, rawCategories, documentExports] = await Promise.all([
    prisma.property.findMany({ where: portalWhere(user), orderBy: { name: "asc" } }),
    prisma.unit.findMany({ where: { property: portalWhere(user) }, include: { property: true }, orderBy: [{ property: { name: "asc" } }, { unitNumber: "asc" }] }),
    prisma.documentCategory.findMany({
      where: { OR: [{ portalInstanceId: user.portalInstanceId }, { portalInstanceId: null }] },
      orderBy: [{ group: "asc" }, { name: "asc" }]
    }),
    user.role === Role.ADMIN
      ? prisma.documentExport.findMany({
          where: { portalInstanceId: user.portalInstanceId },
          include: { items: { include: { document: { select: { id: true, title: true, filename: true } } } } },
          orderBy: { createdAt: "desc" }
        })
      : Promise.resolve([])
  ]);
  const categories = dedupeCategories(rawCategories, user.portalInstanceId);
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
  const baseDocumentWhere: Prisma.DocumentWhereInput = user.role === Role.ADMIN
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
  const tenantFilter = searchParams?.tenantId ? await prisma.tenantProfile.findFirst({
    where: { id: searchParams.tenantId, user: portalWhere(user) },
    select: { userId: true, unitId: true }
  }) : null;
  const documentWhere: Prisma.DocumentWhereInput = searchParams?.tenantId && !tenantFilter
    ? { id: "__missing_tenant__" }
    : tenantFilter
    ? {
        AND: [
          baseDocumentWhere,
          {
            OR: [
              { permissions: { some: { userId: tenantFilter.userId, canView: true } } },
              { unitId: tenantFilter.unitId || "" }
            ]
          }
        ]
      }
    : baseDocumentWhere;
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
  const targetDocumentId = searchParams?.documentId || "";
  const targetDocument = targetDocumentId ? await prisma.document.findFirst({
    where: { AND: [documentWhere, { id: targetDocumentId }] },
    select: { id: true, propertyId: true, unit: { select: { propertyId: true } } }
  }) : null;
  const targetGroupId = targetDocument?.propertyId || targetDocument?.unit?.propertyId || (targetDocument ? "general" : "");
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
              targetDocumentId={group.id === targetGroupId ? targetDocumentId : ""}
              units={unitOptions}
            />
          ))}
          {groupedDocuments.length ? null : <div className="rounded-lg border border-dashed border-line bg-white p-6 text-sm text-muted">Noch keine Dokumente vorhanden.</div>}
        </div>
        {user.role === Role.ADMIN ? (
          <div className="grid content-start gap-5">
            <DocumentExportManager initialExports={documentExports.map((item) => ({
              id: item.id,
              name: item.name,
              description: item.description,
              downloadedAt: item.downloadedAt?.toISOString() || null,
              items: item.items.map((exportItem) => exportItem.document)
            }))} />
            <DocumentUploadPanel
              categories={categoryOptions}
              defaultCategoryId={defaultCategoryId}
              defaultPropertyId={defaultPropertyId}
              defaultUnitId={defaultUnitId}
              properties={propertyOptions}
              units={unitOptions}
            />
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

function dedupeCategories<T extends { id: string; group: string; name: string; portalInstanceId: string | null }>(categories: T[], portalInstanceId: string | null) {
  const byLabel = new Map<string, T>();
  for (const category of categories) {
    const key = `${category.group.trim().toLowerCase()}\0${category.name.trim().toLowerCase()}`;
    const existing = byLabel.get(key);
    if (!existing || (category.portalInstanceId === portalInstanceId && existing.portalInstanceId !== portalInstanceId)) {
      byLabel.set(key, category);
    }
  }
  return Array.from(byLabel.values()).sort((a, b) => `${a.group} ${a.name}`.localeCompare(`${b.group} ${b.name}`, "de"));
}
