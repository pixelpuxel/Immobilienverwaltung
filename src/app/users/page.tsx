import { Role } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { BrokerInviteForm } from "@/components/BrokerInviteForm";
import { DeleteDocumentButton } from "@/components/DeleteDocumentButton";
import { DeleteUserButton } from "@/components/DeleteUserButton";
import { DocumentThumbnail } from "@/components/DocumentThumbnail";
import { JsonForm } from "@/components/JsonForm";
import { UserAccessEditor } from "@/components/UserAccessEditor";
import { WohnungsgeberButton } from "@/components/WohnungsgeberButton";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await requireUser([Role.ADMIN]);
  const [users, properties, units, wohnungsgeberDocuments] = await Promise.all([
    prisma.user.findMany({
      include: {
        brokerLinks: { where: { status: "active" }, include: { property: true }, orderBy: { createdAt: "desc" } },
        tenantProfile: { include: { unit: { include: { property: true } } } }
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.property.findMany({ orderBy: { name: "asc" } }),
    prisma.unit.findMany({ include: { property: true }, orderBy: { unitNumber: "asc" } }),
    prisma.document.findMany({
      where: { category: { name: "Wohnungsgeberbestätigung" } },
      include: { permissions: true, category: true },
      orderBy: { createdAt: "desc" }
    })
  ]);
  const propertyOptions = properties.map((property) => ({ id: property.id, name: property.name }));
  const unitOptions = units.map((unit) => ({ id: unit.id, label: `${unit.property.name} / ${unit.unitNumber}` }));
  return (
    <AppShell role={user.role} userId={user.id} email={user.email} canSwitchView={user.role === Role.ADMIN || Boolean(user.impersonatedByAdminId)}>
      <h1 className="text-3xl font-bold">Benutzerverwaltung</h1>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_420px]">
        <div className="rounded-lg border border-line">
          {users.map((item) => (
            <div key={item.id} className="grid gap-4 border-b border-line p-4 text-sm lg:grid-cols-[minmax(0,1fr)_minmax(260px,360px)]">
              <div>
                <strong>{item.name || item.email}</strong>
                <div className="text-muted">{item.email}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-panel px-2 py-1">{item.role}</span>
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
                      : "Vollzugriff"}
                </div>
                {item.role !== Role.ADMIN ? <div className="mt-3"><DeleteUserButton userId={item.id} /></div> : null}
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
          ))}
        </div>
        <div className="grid gap-6">
          <BrokerInviteForm properties={propertyOptions} />
          <JsonForm endpoint="/api/tenants" submitLabel="Mieter einladen">
            <h2 className="text-xl font-bold">Mieter einladen</h2>
            <label>Vorname<input name="firstName" required /></label>
            <label>Nachname<input name="lastName" required /></label>
            <label>E-Mail<input name="email" type="email" required /></label>
            <label>Passwort<input name="password" type="text" defaultValue="BitteSofortAendern123!" /></label>
            <label>Einheit<select name="unitId"><option value="">Keine</option>{units.map((u) => <option key={u.id} value={u.id}>{u.property.name} / {u.unitNumber}</option>)}</select></label>
            <label>Telefon<input name="phone" /></label>
            <label>Aktuelle Anschrift<input name="currentAddress" /></label>
            <label>Geburtsdatum<input name="birthdate" type="date" /></label>
            <label>Einzugsdatum<input name="moveInDate" type="date" /></label>
            <label>Auszugsdatum<input name="moveOutDate" type="date" /></label>
            <input type="hidden" name="isCurrent" value="false" />
            <label className="flex items-center gap-2"><input name="isCurrent" type="checkbox" defaultChecked /> laufend</label>
            <label>Kaltmiete<input name="rentAmount" inputMode="decimal" /></label>
            <label>Nebenkosten<input name="serviceCharges" inputMode="decimal" /></label>
            <label>Kaution<input name="deposit" inputMode="decimal" /></label>
            <label>Anzahl Bewohner<input name="occupantCount" inputMode="numeric" /></label>
            <label>Zahlung bis Werktag<input name="rentDueDay" inputMode="numeric" defaultValue="1" /></label>
            <label>Vermieter-Bank<input name="landlordBankName" /></label>
            <label>Vermieter-IBAN<input name="landlordBankAccount" /></label>
            <label>Zimmer / Mietgegenstand<textarea name="roomDescription" rows={3} /></label>
            <label>Mitbenutzte Räume<textarea name="sharedRooms" rows={3} /></label>
            <label>Staffelmiete<textarea name="steppedRent" rows={4} /></label>
            <label>Besondere Vertragsnotizen<textarea name="contractNotes" rows={4} /></label>
            <label>Besondere Vereinbarungen<textarea name="specialAgreements" rows={4} /></label>
          </JsonForm>
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
