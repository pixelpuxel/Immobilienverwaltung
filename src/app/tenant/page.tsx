import { Role } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { ContractThumbnail } from "@/components/ContractThumbnail";
import { DocumentThumbnail } from "@/components/DocumentThumbnail";
import { JsonForm } from "@/components/JsonForm";
import { UploadForm } from "@/components/UploadForm";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TenantPage() {
  const user = await requireUser([Role.TENANT, Role.ADMIN]);
  const profile = user.role === Role.TENANT
    ? await prisma.tenantProfile.findUnique({
        where: { userId: user.id },
        include: {
          unit: {
            include: {
              property: {
                include: {
                  documents: {
                    where: { isPropertyImage: true },
                    orderBy: [{ isPrimaryImage: "desc" }, { createdAt: "desc" }]
                  }
                }
              }
            }
          }
        }
      })
    : null;
  const documents = profile?.unitId
    ? await prisma.document.findMany({
        where: {
          OR: [
            { permissions: { some: { userId: user.id, canView: true } } },
            { unitId: profile.unitId, category: { visibleToTenant: true }, scope: { in: ["UNIT", "CONTRACT"] } }
          ]
        },
        include: { category: true },
        orderBy: { createdAt: "desc" }
      })
    : [];
  const contracts = profile
    ? await prisma.leaseContract.findMany({
        where: { tenantProfileId: profile.id },
        include: { unit: { include: { property: true } }, template: true },
        orderBy: { createdAt: "desc" }
      })
    : [];
  const utilityDocuments = documents.filter((document) => document.category?.name === "Nebenkostenabrechnungen");
  const otherDocuments = documents.filter((document) => document.category?.name !== "Nebenkostenabrechnungen");
  const primaryImage = profile?.unit?.property.documents.find((document) => document.isPrimaryImage) || profile?.unit?.property.documents[0];
  return (
    <AppShell role={user.role} userId={user.id} email={user.email} canSwitchView={user.role === Role.ADMIN || Boolean(user.impersonatedByAdminId)}>
      <h1 className="text-3xl font-bold">Mieterbereich</h1>
      {profile?.unit?.property ? (
        <section className="mt-6 overflow-hidden rounded-lg border border-line bg-white">
          {primaryImage ? (
            <img className="max-h-72 w-full object-cover" src={`/api/documents/${primaryImage.id}/preview`} alt={`Hauptbild ${profile.unit.property.name}`} loading="lazy" />
          ) : null}
          <div className="p-5">
            <div className="text-sm font-semibold uppercase tracking-wide text-accent">Meine Immobilie</div>
            <h2 className="mt-1 text-2xl font-bold">{profile.unit.property.name}</h2>
            <p className="text-muted">{profile.unit.property.address} / {profile.unit.unitNumber}</p>
          </div>
        </section>
      ) : null}
      {profile ? (
        <section className="mt-6 rounded-lg border border-line p-5">
          <h2 className="text-xl font-bold">Mietvertraege</h2>
          <div className="mt-4 grid gap-3">
            {contracts.length ? contracts.map((contract) => (
              <div className="grid gap-3 rounded-md bg-panel p-3 text-sm sm:grid-cols-[96px_minmax(0,1fr)_120px_120px]" key={contract.id}>
                <ContractThumbnail id={contract.id} title={`${profile.firstName} ${profile.lastName}`} compact />
                <div>
                  <div className="font-semibold">{contract.template?.name || "Mietvertrag"}</div>
                  <div className="text-muted">{contract.unit.property.name} / {contract.unit.unitNumber}</div>
                  <div className="text-muted">{new Intl.DateTimeFormat("de-DE").format(contract.createdAt)}</div>
                </div>
                <a className="button-secondary text-center" href={`/api/contracts/${contract.id}/preview`} target="_blank" rel="noreferrer">Vorschau</a>
                <a className="button text-center" href={`/api/contracts/${contract.id}/download?format=pdf`}>PDF</a>
              </div>
            )) : <div className="text-sm text-muted">Noch kein Mietvertrag bereitgestellt.</div>}
          </div>
        </section>
      ) : null}
      {profile ? (
        <section className="mt-6 rounded-lg border border-line p-5">
          <h2 className="text-xl font-bold">{profile.firstName} {profile.lastName}</h2>
          <p className="text-muted">{profile.unit?.property.name} / {profile.unit?.unitNumber}</p>
          <p className="mt-2 text-sm text-muted">
            Einzug: {formatDate(profile.moveInDate)} · Auszug: {profile.isCurrent ? "laufend" : formatDate(profile.moveOutDate)}
          </p>
        </section>
      ) : null}
      {profile ? (
        <section className="mt-6 rounded-lg border border-line p-5">
          <div>
            <h2 className="text-xl font-bold">Nebenkostenabrechnungen</h2>
            <p className="mt-1 text-sm text-muted">Jahresabrechnungen werden vom Eigentümer je Einheit bereitgestellt und bleiben hier getrennt von allgemeinen Dokumenten auffindbar.</p>
          </div>
          <div className="mt-4 grid gap-3">
            {utilityDocuments.length ? utilityDocuments.map((document) => (
              <div className="grid gap-3 rounded-md bg-panel p-3 text-sm sm:grid-cols-[96px_minmax(0,1fr)_130px]" key={document.id}>
                <DocumentThumbnail id={document.id} title={document.title} mimeType={document.mimeType} hasFile={Boolean(document.storagePath)} compact />
                <div>
                  <div className="font-semibold">{document.title}</div>
                  <div className="text-muted">{document.category?.group} / {document.category?.name}</div>
                </div>
                <a className="button text-center" href={`/api/documents/${document.id}/download`}>Download</a>
              </div>
            )) : <div className="text-sm text-muted">Noch keine Nebenkostenabrechnung bereitgestellt.</div>}
          </div>
        </section>
      ) : null}
      {profile ? (
        <section className="mt-6 rounded-lg border border-line p-5">
          <h2 className="text-xl font-bold">Bereitgestellte Dokumente</h2>
          <div className="mt-4 grid gap-3">
            {otherDocuments.length ? otherDocuments.map((document) => (
              <div className="grid gap-3 rounded-md bg-panel p-3 text-sm sm:grid-cols-[96px_minmax(0,1fr)_130px]" key={document.id}>
                <DocumentThumbnail id={document.id} title={document.title} mimeType={document.mimeType} hasFile={Boolean(document.storagePath)} compact />
                <div>
                  <div className="font-semibold">{document.title}</div>
                  <div className="text-muted">{document.category?.group} / {document.category?.name}</div>
                </div>
                <a className="button text-center" href={`/api/documents/${document.id}/download`}>Download</a>
              </div>
            )) : <div className="text-sm text-muted">Noch keine weiteren Dokumente bereitgestellt.</div>}
          </div>
        </section>
      ) : null}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <JsonForm endpoint="/api/tenants" submitLabel="Stammdaten speichern">
          <label>Vorname<input name="firstName" defaultValue={profile?.firstName} required /></label>
          <label>Nachname<input name="lastName" defaultValue={profile?.lastName} required /></label>
          <label>E-Mail<input name="email" type="email" defaultValue={profile?.email || user.email} required /></label>
          <label>Geburtsdatum<input name="birthdate" type="date" defaultValue={toDateInput(profile?.birthdate)} /></label>
          <label>Aktuelle Anschrift<input name="currentAddress" defaultValue={profile?.currentAddress || ""} /></label>
          <label>Telefonnummer<input name="phone" defaultValue={profile?.phone || ""} /></label>
          <label>Einzugsdatum<input name="moveInDate" type="date" defaultValue={toDateInput(profile?.moveInDate)} /></label>
          <label>Auszugsdatum<input name="moveOutDate" type="date" defaultValue={toDateInput(profile?.moveOutDate)} /></label>
          <input type="hidden" name="isCurrent" value="false" />
          <label className="flex items-center gap-2"><input name="isCurrent" type="checkbox" defaultChecked={profile?.isCurrent ?? true} /> laufend</label>
          <label>Mietbeginn<input name="leaseStartDate" type="date" defaultValue={toDateInput(profile?.leaseStartDate)} /></label>
          <label>Miethoehe<input name="rentAmount" type="number" step="0.01" defaultValue={profile?.rentAmount?.toString()} /></label>
          <label>Tiefgarage<select name="garageRent" defaultValue={profile?.garageRent?.toString() || ""}>
            <option value="">Keine Angabe</option>
            <option value="0">Keine Tiefgarage / 0 EUR</option>
            <option value="50">50 EUR</option>
            <option value="75">75 EUR</option>
            <option value="80">80 EUR</option>
            <option value="90">90 EUR</option>
            <option value="100">100 EUR</option>
            <option value="120">120 EUR</option>
            <option value="150">150 EUR</option>
          </select></label>
          <label>Nebenkosten<input name="serviceCharges" type="number" step="0.01" defaultValue={profile?.serviceCharges?.toString()} /></label>
          <label>Kaution<input name="deposit" type="number" step="0.01" defaultValue={profile?.deposit?.toString()} /></label>
          <label>Anzahl Bewohner<input name="occupantCount" type="number" defaultValue={profile?.occupantCount?.toString()} /></label>
          <label>Bankverbindung<input name="bankAccount" defaultValue={profile?.bankAccount || ""} /></label>
          <label>Haustiere<input name="pets" defaultValue={profile?.pets || ""} /></label>
          <label>Besondere Vereinbarungen<textarea name="specialAgreements" defaultValue={profile?.specialAgreements || ""} /></label>
        </JsonForm>
        <UploadForm endpoint="/api/documents" submitLabel="Dokument fuer Verwaltung hochladen">
          <input type="hidden" name="scope" value="TENANT" />
          <input type="hidden" name="unitId" value={profile?.unitId || ""} />
          <label>Titel<input name="title" /></label>
        </UploadForm>
      </div>
    </AppShell>
  );
}

function formatDate(value?: Date | null) {
  return value ? new Intl.DateTimeFormat("de-DE").format(value) : "offen";
}

function toDateInput(value?: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}
