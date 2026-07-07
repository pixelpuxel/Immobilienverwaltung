import { DocumentScope, Prisma, Role } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { DocumentExportAddButton, DocumentExportManager } from "@/components/DocumentExportManager";
import { DocumentThumbnail } from "@/components/DocumentThumbnail";
import { DocumentUploadPanel } from "@/components/DocumentUploadPanel";
import { LazyDocumentGroup } from "@/components/LazyDocumentGroup";
import { requireUser } from "@/lib/auth";
import { brokerPropertyIds, brokerVisibleDocumentWhere, tenantUnitId } from "@/lib/permissions";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DocumentsPage({ searchParams }: { searchParams?: { propertyId?: string; unitId?: string; category?: string; documentId?: string; tenantId?: string } }) {
  const user = await requireUser();
  const [properties, units, rawCategories, documentExports, shareUsers, tenantOptionsRaw] = await Promise.all([
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
    ,
    user.role === Role.ADMIN
      ? prisma.user.findMany({
          where: { active: true, role: { in: [Role.BROKER, Role.TENANT, Role.TAX_ADVISOR] }, ...portalWhere(user) },
          select: { id: true, email: true, username: true, name: true, role: true, tenantProfile: { select: { unit: { select: { unitNumber: true, property: { select: { name: true } } } } } }, brokerLinks: { where: { status: "active" }, select: { property: { select: { name: true } } } } },
          orderBy: [{ role: "asc" }, { email: "asc" }]
        })
      : Promise.resolve([])
    ,
    user.role === Role.ADMIN
      ? prisma.tenantProfile.findMany({
          where: { user: portalWhere(user) },
          include: { unit: { include: { property: true } }, user: { select: { email: true, name: true } } },
          orderBy: [{ isCurrent: "desc" }, { lastName: "asc" }, { firstName: "asc" }]
        })
      : Promise.resolve([])
  ]);
  const categories = dedupeCategories(rawCategories, user.portalInstanceId);
  const propertyOptions = properties.map((property) => ({ id: property.id, label: property.name }));
  const unitOptions = units.map((unit) => ({ id: unit.id, propertyId: unit.propertyId, label: `${unit.property.name} / ${unit.unitNumber}` }));
  const categoryOptions = categories.map((category) => ({ id: category.id, label: `${category.group} / ${category.name}` }));
  const shareUserOptions = shareUsers.map((shareUser) => ({
    id: shareUser.id,
    role: shareUser.role,
    label: shareUser.name || shareUser.username || shareUser.email,
    detail: shareUser.role === Role.BROKER
      ? shareUser.brokerLinks.map((link) => link.property.name).join(", ") || shareUser.email
      : shareUser.role === Role.TENANT
        ? shareUser.tenantProfile?.unit ? `${shareUser.tenantProfile.unit.property.name} / ${shareUser.tenantProfile.unit.unitNumber}` : shareUser.email
        : shareUser.email
  }));
  const tenantOptions = tenantOptionsRaw.map((tenant) => ({
    id: tenant.id,
    unitId: tenant.unitId || undefined,
    label: `${tenant.firstName} ${tenant.lastName}`.trim() || tenant.user.name || tenant.email,
    detail: tenant.unit ? `${tenant.unit.property.name} / ${tenant.unit.unitNumber}` : tenant.email
  }));
  const defaultPropertyId = searchParams?.propertyId || "";
  const defaultUnitId = searchParams?.unitId || "";
  const defaultTenantId = searchParams?.tenantId || "";
  const defaultCategoryId = searchParams?.category === "nebenkosten"
    ? categories.find((category) => category.name === "Nebenkostenabrechnungen")?.id || ""
    : "";
  const propertyIds = user.role === Role.BROKER ? await brokerPropertyIds(user.id) : [];
  const unitId = user.role === Role.TENANT ? await tenantUnitId(user.id) : null;
  const baseDocumentWhere: Prisma.DocumentWhereInput = user.role === Role.ADMIN
    ? portalWhere(user)
      : user.role === Role.BROKER
      ? { ...portalWhere(user), ...brokerVisibleDocumentWhere(user.id, propertyIds) }
      : user.role === Role.TAX_ADVISOR
        ? { ...portalWhere(user), permissions: { some: { userId: user.id, canView: true } } }
      : {
          ...portalWhere(user),
          OR: [
            { permissions: { some: { userId: user.id, canView: true } } },
            { tenantProfile: { userId: user.id } },
            { unitId, category: { visibleToTenant: true }, scope: { in: [DocumentScope.UNIT, DocumentScope.CONTRACT] } }
          ]
        };
  const tenantFilter = searchParams?.tenantId ? await prisma.tenantProfile.findFirst({
    where: { id: searchParams.tenantId, user: portalWhere(user) },
    select: {
      id: true,
      userId: true,
      unitId: true,
      firstName: true,
      lastName: true,
      email: true,
      unit: { select: { unitNumber: true, property: { select: { name: true } } } }
    }
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
              { tenantProfileId: tenantFilter.id }
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
  const tenantDocuments = tenantFilter ? await prisma.document.findMany({
    where: documentWhere,
    include: {
      property: true,
      unit: { include: { property: true } },
      category: true,
      permissions: { where: { userId: tenantFilter.userId }, select: { canDownload: true, canView: true } }
    },
    orderBy: [{ documentYear: "desc" }, { createdAt: "desc" }],
    take: 200
  }) : [];
  const targetGroupId = targetDocument?.propertyId || targetDocument?.unit?.propertyId || (targetDocument ? "general" : "");
  return (
    <AppShell role={user.role} userId={user.id} email={user.email} canSwitchView={user.role === Role.ADMIN || Boolean(user.impersonatedByAdminId)}>
      <h1 className="text-3xl font-bold">Dokumentenverwaltung</h1>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_420px]">
        <div className="grid w-full gap-5">
          {tenantFilter ? <TenantDocumentOverview tenant={tenantFilter} documents={tenantDocuments} canDownloadAll={user.role === Role.ADMIN} isAdmin={user.role === Role.ADMIN} /> : null}
          {groupedDocuments.map((group) => (
            <LazyDocumentGroup
              categories={categoryOptions}
              group={group}
              isAdmin={user.role === Role.ADMIN}
              key={group.id}
              properties={propertyOptions}
              shareUsers={shareUserOptions}
              targetDocumentId={group.id === targetGroupId ? targetDocumentId : ""}
              tenants={tenantOptions}
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
              defaultTenantId={defaultTenantId}
              defaultUnitId={defaultUnitId}
              properties={propertyOptions}
              tenants={tenantOptions}
              units={unitOptions}
            />
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

function TenantDocumentOverview({
  tenant,
  documents,
  canDownloadAll,
  isAdmin
}: {
  tenant: {
    firstName: string;
    lastName: string;
    email: string;
    unit: { unitNumber: string; property: { name: string } } | null;
  };
  documents: Array<{
    id: string;
    title: string;
    filename: string;
    mimeType: string;
    storagePath: string | null;
    documentYear: number | null;
    createdAt: Date;
    property: { name: string } | null;
    unit: { unitNumber: string; property: { name: string } } | null;
    category: { group: string; name: string } | null;
    permissions: Array<{ canDownload: boolean; canView: boolean }>;
  }>;
  canDownloadAll: boolean;
  isAdmin: boolean;
}) {
  const tenantName = `${tenant.firstName} ${tenant.lastName}`.trim() || tenant.email;
  return (
    <section className="overflow-hidden rounded-lg border border-line bg-white shadow-sm">
      <div className="border-b border-line bg-gradient-to-r from-emerald-50 via-white to-sky-50 p-4">
        <h2 className="text-xl font-bold">Dokumente dieses Mieters</h2>
        <p className="mt-1 text-sm text-muted">
          {tenantName}
          {tenant.unit ? ` · ${tenant.unit.property.name} / ${tenant.unit.unitNumber}` : ""}
          {` · ${documents.length} Dokument${documents.length === 1 ? "" : "e"}`}
        </p>
      </div>
      <div className="divide-y divide-line">
        {documents.map((document) => {
          const canDownload = canDownloadAll || document.permissions.some((permission) => permission.canDownload);
          const location = document.unit ? `${document.unit.property.name} / ${document.unit.unitNumber}` : document.property?.name || "Allgemein";
          return (
            <div className="grid gap-3 p-4 text-sm sm:grid-cols-[88px_minmax(0,1fr)]" key={document.id}>
              <DocumentThumbnail id={document.id} title={document.title} mimeType={document.mimeType} hasFile={Boolean(document.storagePath)} compact />
              <div className="min-w-0">
                <div className="break-words font-bold">{document.title}</div>
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted">
                  <span className="rounded-full bg-panel px-2 py-1">{document.category ? `${document.category.group} / ${document.category.name}` : "Ohne Kategorie"}</span>
                  <span className="rounded-full bg-panel px-2 py-1">{document.documentYear || document.createdAt.getFullYear()}</span>
                  <span className="rounded-full bg-panel px-2 py-1">{location}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {document.storagePath ? <a className="button-secondary flex min-h-10 items-center justify-center px-3 py-2 text-sm" href={`/api/documents/${document.id}/preview`}>Vorschau</a> : null}
                  {document.storagePath && canDownload ? <a className="button flex min-h-10 items-center justify-center px-3 py-2 text-sm" href={`/api/documents/${document.id}/download`}>Download</a> : null}
                  {isAdmin ? <DocumentExportAddButton documentId={document.id} /> : null}
                  <a className="button-secondary flex min-h-10 items-center justify-center px-3 py-2 text-sm" href={`/documents?documentId=${document.id}`}>In Dokumente bearbeiten</a>
                </div>
              </div>
            </div>
          );
        })}
        {!documents.length ? <div className="p-4 text-sm text-muted">Für diesen Mieter sind noch keine Dokumente zugeordnet oder freigegeben.</div> : null}
      </div>
    </section>
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
