import { Role } from "@prisma/client";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { BrokerInviteForm } from "@/components/BrokerInviteForm";
import { DeleteDocumentButton } from "@/components/DeleteDocumentButton";
import { DeleteUserButton } from "@/components/DeleteUserButton";
import { DocumentThumbnail } from "@/components/DocumentThumbnail";
import { JsonForm } from "@/components/JsonForm";
import { TenantCreateForm } from "@/components/TenantCreateForm";
import { UserAccessEditor } from "@/components/UserAccessEditor";
import { UserEditForm } from "@/components/UserEditForm";
import { WohnungsgeberButton } from "@/components/WohnungsgeberButton";
import { requireUser } from "@/lib/auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await requireUser([Role.ADMIN]);
  const [users, properties, units, wohnungsgeberDocuments] = await Promise.all([
    prisma.user.findMany({
      where: portalWhere(user),
      include: {
        brokerLinks: { where: { status: "active" }, include: { property: true }, orderBy: { createdAt: "desc" } },
        tenantProfile: { include: { unit: { include: { property: true } } } }
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.property.findMany({ where: portalWhere(user), orderBy: { name: "asc" } }),
    prisma.unit.findMany({ where: { property: portalWhere(user) }, include: { property: true }, orderBy: { unitNumber: "asc" } }),
    prisma.document.findMany({
      where: { ...portalWhere(user), category: { name: "Wohnungsgeberbestätigung" } },
      include: { permissions: true, category: true },
      orderBy: { createdAt: "desc" }
    })
  ]);
  const propertyOptions = properties.map((property) => ({ id: property.id, name: property.name }));
  const unitOptions = units.map((unit) => ({ id: unit.id, label: `${unit.property.name} / ${unit.unitNumber}` }));
  const tenantUnitOptions = units.map((unit) => ({
    id: unit.id,
    label: `${unit.property.name} / ${unit.unitNumber}`,
    rentAmount: unit.rentAmount?.toString() || "",
    garageRent: unit.garageRent?.toString() || "",
    serviceCharges: unit.serviceCharges?.toString() || ""
  }));
  const ownerUsers = users.filter((item) => item.role === Role.ADMIN);
  const brokerUsers = users.filter((item) => item.role === Role.BROKER);
  const tenantUsers = users.filter((item) => item.role === Role.TENANT);
  const tenantsByUnit = Array.from(tenantUsers.reduce((map, item) => {
    const label = item.tenantProfile?.unit ? `${item.tenantProfile.unit.property.name} / ${item.tenantProfile.unit.unitNumber}` : "Ohne zugeordnete Einheit";
    const list = map.get(label) || [];
    list.push(item);
    map.set(label, list);
    return map;
  }, new Map<string, typeof tenantUsers>()).entries()).map(([label, list]) => ({
    label,
    current: list.filter((item) => item.tenantProfile?.isCurrent).sort(compareTenantMoveInDesc),
    past: list.filter((item) => !item.tenantProfile?.isCurrent).sort(compareTenantMoveInDesc)
  })).sort((a, b) => a.label.localeCompare(b.label, "de"));
  const renderUserCard = (item: (typeof users)[number]) => (
    <div id={`user-${item.id}`} key={item.id} className="scroll-mt-24 grid gap-4 border-b border-line p-4 text-sm last:border-b-0 lg:grid-cols-[minmax(0,1fr)_minmax(260px,360px)]">
      <div>
        <strong>{item.name || item.email}</strong>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {item.username ? <span className="rounded-full bg-accent/10 px-2 py-1 font-semibold text-accent">@{item.username}</span> : null}
          {!item.email.endsWith("@portal.local") ? <span className="rounded-full bg-panel px-2 py-1 text-muted">{item.email}</span> : null}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-panel px-2 py-1">{item.role === Role.ADMIN ? "Eigentümer" : item.role === Role.BROKER ? "Makler" : "Mieter"}</span>
          <span className="rounded-full bg-panel px-2 py-1">{item.active ? "aktiv" : "gesperrt"}</span>
        </div>
        <div className="mt-3 text-muted">
          {item.role === Role.BROKER
            ? item.brokerLinks.length
              ? `Freigegeben: ${item.brokerLinks.map((link) => link.property.name).join(", ")}`
              : "Keine Immobilien freigegeben"
            : item.role === Role.TENANT
              ? item.tenantProfile?.unit
                ? `Einheit: ${item.tenantProfile.unit.property.name} / ${item.tenantProfile.unit.unitNumber} · ${item.tenantProfile.isCurrent ? "laufend" : "beendet"} · Einzug ${formatDate(item.tenantProfile.moveInDate)}`
                : "Keine Einheit zugeordnet"
              : "Eigentümer mit Vollzugriff"}
        </div>
        {item.role !== Role.ADMIN ? <div className="mt-3"><DeleteUserButton userId={item.id} /></div> : null}
        <UserEditForm
          currentUserId={user.id}
          user={{
            id: item.id,
            email: item.email,
            username: item.username,
            name: item.name,
            role: item.role,
            active: item.active,
            contactPerson: item.contactPerson,
            contactAddress: item.contactAddress,
            contactPhone: item.contactPhone,
            contactEmail: item.contactEmail
          }}
        />
      </div>
      <div>
        <UserAccessEditor
          userId={item.id}
          role={item.role}
          propertyIds={item.brokerLinks.map((link) => link.propertyId)}
          unitId={item.tenantProfile?.unitId || ""}
          moveInDate={toDateInput(item.tenantProfile?.moveInDate)}
          moveOutDate={toDateInput(item.tenantProfile?.moveOutDate)}
          isCurrent={item.tenantProfile?.isCurrent ?? true}
          properties={propertyOptions}
          units={unitOptions}
        />
        {item.role === Role.TENANT && item.tenantProfile ? (
          <div className="mt-4 grid gap-3 rounded-md bg-panel p-3">
            <div className="text-xs font-semibold text-muted">Wohnungsgeberbestaetigung</div>
            {wohnungsgeberDocuments.filter((document) => document.permissions.some((permission) => permission.userId === item.id)).map((document) => (
              <div className="grid gap-2" key={document.id}>
                <DocumentThumbnail id={document.id} title={document.title} mimeType={document.mimeType} hasFile={Boolean(document.storagePath)} compact />
                <a className="button text-center text-sm" href={`/api/documents/${document.id}/download`}>Download</a>
                <DeleteDocumentButton documentId={document.id} label="Alte Bestaetigung loeschen" />
              </div>
            ))}
            {wohnungsgeberDocuments.some((document) => document.permissions.some((permission) => permission.userId === item.id)) ? null : (
              <WohnungsgeberButton tenantProfileId={item.tenantProfile.id} />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
  return (
    <AppShell role={user.role} userId={user.id} email={user.email} canSwitchView={user.role === Role.ADMIN || Boolean(user.impersonatedByAdminId)}>
      <h1 className="text-3xl font-bold">Benutzerverwaltung</h1>
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_420px]">
        <div className="grid gap-4 self-start">
          <UserRoleGroup count={ownerUsers.length} title="Eigentümer" open>{ownerUsers.map(renderUserCard)}</UserRoleGroup>
          <UserRoleGroup count={brokerUsers.length} title="Makler">{brokerUsers.map(renderUserCard)}</UserRoleGroup>
          <UserRoleGroup count={tenantUsers.length} title="Mieter" open>
            <div className="grid gap-3 p-3">
              {tenantsByUnit.map((group) => (
                <details className="overflow-hidden rounded-md border border-line bg-white" key={group.label} open={group.current.length > 0}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-panel px-3 py-2 [&::-webkit-details-marker]:hidden">
                    <span className="font-bold">{group.label}</span>
                    <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-muted">{group.current.length} aktuell · {group.past.length} vergangen</span>
                  </summary>
                  <div className="border-t border-line">
                    {group.current.map(renderUserCard)}
                    {group.past.length ? (
                      <details className="border-t border-line bg-white">
                        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-bold text-muted [&::-webkit-details-marker]:hidden">Vergangene Mieter aufklappen</summary>
                        <div className="border-t border-line">{group.past.map(renderUserCard)}</div>
                      </details>
                    ) : null}
                  </div>
                </details>
              ))}
            </div>
          </UserRoleGroup>
        </div>
        <div className="grid content-start gap-6 self-start">
          <JsonForm endpoint="/api/admin-users" submitLabel="Eigentümerzugang anlegen">
            <h2 className="text-xl font-bold">Weiteren Eigentümerzugang anlegen</h2>
            <p className="text-sm text-muted">Für Geschäftspartner mit weitgehend gleichen Rechten wie der Eigentümer.</p>
            <label>Name<input name="name" /></label>
            <label>Benutzername<input name="username" /></label>
            <label>E-Mail<input name="email" type="email" required /></label>
            <label>Passwort<input name="password" type="text" defaultValue="BitteSofortAendern123!" required /></label>
          </JsonForm>
          <BrokerInviteForm properties={propertyOptions} />
          <TenantCreateForm units={tenantUnitOptions} />
        </div>
      </div>
    </AppShell>
  );
}

function toDateInput(value?: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function formatDate(value?: Date | null) {
  return value ? new Intl.DateTimeFormat("de-DE").format(value) : "offen";
}

function compareTenantMoveInDesc(a: { tenantProfile?: { moveInDate: Date | null } | null }, b: { tenantProfile?: { moveInDate: Date | null } | null }) {
  return Number(b.tenantProfile?.moveInDate || 0) - Number(a.tenantProfile?.moveInDate || 0);
}

function UserRoleGroup({ title, count, children, open = false }: { title: string; count: number; children: ReactNode; open?: boolean }) {
  return (
    <details className="overflow-hidden rounded-lg border border-line bg-white shadow-sm" open={open}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-[linear-gradient(135deg,#f7fcf8,#eef4ff)] p-4 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-3">
          <span className="rounded bg-accent px-2 py-1 text-sm font-bold text-white">›</span>
          <span className="font-bold">{title}</span>
        </span>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-muted">{count}</span>
      </summary>
      <div className="border-t border-line">{children}</div>
    </details>
  );
}
