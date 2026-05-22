import Link from "next/link";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { DocumentThumbnail } from "@/components/DocumentThumbnail";
import { EditableField } from "@/components/EditableField";
import { requireUser } from "@/lib/auth";
import { brokerPropertyIds, canAccessDocument, tenantUnitId } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PropertyDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const property = await prisma.property.findUnique({
    where: { id: params.id },
    include: {
      units: { orderBy: { unitNumber: "asc" }, include: { tenants: true, contracts: true, documents: { include: { category: true } } } },
      documents: { orderBy: { createdAt: "desc" }, include: { category: true, unit: true } },
      brokerRequests: { include: { user: true } }
    }
  });

  if (!property) notFound();
  if (user.role === Role.BROKER) {
    const allowedIds = await brokerPropertyIds(user.id);
    if (!allowedIds.includes(property.id)) notFound();
  }
  if (user.role === Role.TENANT) {
    const unitId = await tenantUnitId(user.id);
    if (!property.units.some((unit) => unit.id === unitId)) notFound();
  }

  const canEdit = user.role === Role.ADMIN;
  const propertyEndpoint = `/api/properties/${property.id}`;
  const visibleDocuments = user.role === Role.ADMIN
    ? property.documents
    : (await Promise.all(property.documents.map(async (document) => ({
        document,
        allowed: await canAccessDocument(user, document.id)
      })))).filter((item) => item.allowed).map((item) => item.document);
  const totalRent = property.units.reduce((sum, unit) => sum + Number(unit.rentAmount || 0), 0);
  const totalArea = property.units.reduce((sum, unit) => sum + Number(unit.livingArea || 0), 0);
  const occupiedUnits = property.units.filter((unit) => unit.status === "vermietet").length;

  return (
    <AppShell role={user.role} userId={user.id} email={user.email} canSwitchView={user.role === Role.ADMIN || Boolean(user.impersonatedByAdminId)}>
      <div className="mb-6">
        <Link className="text-sm font-semibold text-accent" href="/properties">Zurueck zu Immobilien</Link>
        <div className="mt-4 grid gap-3 sm:flex sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold">{property.name}</h1>
            <p className="mt-1 text-muted">{property.address}</p>
          </div>
          <span className="rounded-full bg-panel px-3 py-1 text-sm">{property.rentalStatus || "offen"}</span>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Einheiten" value={property.units.length} />
        <Metric label="Vermietet" value={`${occupiedUnits} / ${property.units.length}`} />
        <Metric label="Wohnflaeche" value={`${formatNumber(totalArea || property.livingArea)} qm`} />
        <Metric label="Kaltmiete gesamt" value={`${formatCurrency(totalRent)}`} />
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-6">
          <section className="rounded-lg border border-line p-4 sm:p-5">
            <h2 className="text-xl font-bold">Objektdaten</h2>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <EditableField canEdit={canEdit} endpoint={propertyEndpoint} field="name" label="Objektname" value={property.name} />
              <EditableField canEdit={canEdit} endpoint={propertyEndpoint} field="address" label="Adresse" value={property.address} />
              <EditableField canEdit={canEdit} endpoint={propertyEndpoint} field="objectType" label="Objekttyp" value={property.objectType || ""} />
              <EditableField canEdit={canEdit} endpoint={propertyEndpoint} field="constructionYear" label="Baujahr" type="number" value={property.constructionYear?.toString() || ""} />
              <EditableField canEdit={canEdit} endpoint={propertyEndpoint} field="livingArea" label="Wohnflaeche" type="number" suffix=" qm" value={property.livingArea?.toString() || ""} />
              <EditableField canEdit={canEdit} endpoint={propertyEndpoint} field="usableArea" label="Nutzflaeche" type="number" suffix=" qm" value={property.usableArea?.toString() || ""} />
              <EditableField canEdit={canEdit} endpoint={propertyEndpoint} field="plotArea" label="Grundstuecksflaeche" type="number" suffix=" qm" value={property.plotArea?.toString() || ""} />
              <EditableField canEdit={canEdit} endpoint={propertyEndpoint} field="rooms" label="Zimmer" type="number" value={property.rooms?.toString() || ""} />
              <EditableField canEdit={canEdit} endpoint={propertyEndpoint} field="unitCount" label="Anzahl Einheiten" type="number" value={property.unitCount.toString()} />
              <EditableField canEdit={canEdit} endpoint={propertyEndpoint} field="floor" label="Etage" value={property.floor || ""} />
              <EditableField canEdit={canEdit} endpoint={propertyEndpoint} field="parkingSpaces" label="Stellplaetze" type="number" value={property.parkingSpaces?.toString() || ""} />
              <EditableField canEdit={canEdit} endpoint={propertyEndpoint} field="energyCertificate" label="Energieausweis" value={property.energyCertificate || ""} />
              <EditableField canEdit={canEdit} endpoint={propertyEndpoint} field="heatingType" label="Heizungsart" value={property.heatingType || ""} />
              <EditableField canEdit={canEdit} endpoint={propertyEndpoint} field="condition" label="Zustand" value={property.condition || ""} />
              <EditableField canEdit={canEdit} endpoint={propertyEndpoint} field="rentalStatus" label="Vermietungsstatus" value={property.rentalStatus || ""} options={["frei", "teilvermietet", "voll vermietet"]} type="select" />
              <EditableField canEdit={canEdit} endpoint={propertyEndpoint} field="expectedPurchasePrice" label="Kaufpreisvorstellung" type="number" value={property.expectedPurchasePrice?.toString() || ""} />
            </div>
            <div className="mt-4 grid gap-3 text-sm">
              <EditableField canEdit={canEdit} endpoint={propertyEndpoint} field="modernizations" label="Modernisierungen" type="textarea" value={property.modernizations || ""} />
              <EditableField canEdit={canEdit} endpoint={propertyEndpoint} field="internalNotes" label="Interne Notizen" type="textarea" value={property.internalNotes || ""} />
            </div>
          </section>

          <section className="rounded-lg border border-line">
            <div className="border-b border-line p-4 font-bold">Einheiten</div>
            {property.units.length ? property.units.map((unit) => (
              <div key={unit.id} className="grid gap-3 border-b border-line p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <EditableField canEdit={canEdit} endpoint={`/api/units/${unit.id}`} field="unitNumber" label="Einheit" value={unit.unitNumber} />
                <EditableField canEdit={canEdit} endpoint={`/api/units/${unit.id}`} field="floor" label="Etage" value={unit.floor || ""} />
                <EditableField canEdit={canEdit} endpoint={`/api/units/${unit.id}`} field="rooms" label="Zimmer" type="number" value={unit.rooms?.toString() || ""} />
                <EditableField canEdit={canEdit} endpoint={`/api/units/${unit.id}`} field="livingArea" label="Wohnflaeche" type="number" suffix=" qm" value={unit.livingArea?.toString() || ""} />
                <EditableField canEdit={canEdit} endpoint={`/api/units/${unit.id}`} field="rentAmount" label="Kaltmiete" type="number" suffix=" EUR" value={unit.rentAmount?.toString() || ""} />
                <EditableField canEdit={canEdit} endpoint={`/api/units/${unit.id}`} field="serviceCharges" label="Nebenkosten" type="number" suffix=" EUR" value={unit.serviceCharges?.toString() || ""} />
                <EditableField canEdit={canEdit} endpoint={`/api/units/${unit.id}`} field="warmRent" label="Warmmiete" type="number" suffix=" EUR" value={unit.warmRent?.toString() || ""} />
                <EditableField canEdit={canEdit} endpoint={`/api/units/${unit.id}`} field="status" label="Status" type="select" options={["vermietet", "frei", "reserviert"]} value={unit.status || ""} />
              </div>
            )) : <div className="p-4 text-sm text-muted">Noch keine Einheiten angelegt.</div>}
          </section>

          <section className="rounded-lg border border-line">
            <div className="border-b border-line p-4 font-bold">Dokumente</div>
            {visibleDocuments.length ? visibleDocuments.map((document) => (
              <div key={document.id} className="grid gap-3 border-b border-line p-4 text-sm sm:grid-cols-[120px_minmax(0,1fr)_120px_140px]">
                <DocumentThumbnail id={document.id} title={document.title} mimeType={document.mimeType} hasFile={Boolean(document.storagePath)} compact />
                <div>
                  <div className="font-semibold">{document.title}</div>
                  <div className="text-muted">{document.category ? `${document.category.group} / ${document.category.name}` : "ohne Kategorie"}</div>
                </div>
                <div>{document.status}</div>
                {document.storagePath ? (
                  <a className="button block text-center" href={`/api/documents/${document.id}/download`}>Download</a>
                ) : (
                  <span className="rounded-md border border-line bg-panel px-3 py-2 text-center text-muted">Keine Datei</span>
                )}
              </div>
            )) : <div className="p-4 text-sm text-muted">Keine freigegebenen Dokumente vorhanden.</div>}
          </section>
        </div>

        <aside className="grid content-start gap-4">
          {canEdit ? (
            <section className="rounded-lg border border-line bg-panel p-4">
              <h2 className="text-lg font-bold">Maklerzugriffe</h2>
              <div className="mt-3 grid gap-2 text-sm">
                {property.brokerRequests.length ? property.brokerRequests.map((request) => (
                  <div key={request.id} className="rounded-md bg-white p-3">
                    <div className="font-semibold">{request.user.name || request.user.email}</div>
                    <div className="text-muted">{request.status}</div>
                  </div>
                )) : <div className="text-muted">Keine Makler freigegeben.</div>}
              </div>
            </section>
          ) : null}
          {canEdit ? <section className="rounded-lg border border-line bg-panel p-4">
            <h2 className="text-lg font-bold">Schnellaktionen</h2>
            <div className="mt-3 grid gap-2">
              <Link className="button block text-center" href="/documents">Dokument hochladen</Link>
              <Link className="button button-secondary block text-center" href="/users">Makler oder Mieter einladen</Link>
              <Link className="button button-secondary block text-center" href="/contracts">Vertrag generieren</Link>
            </div>
          </section> : null}
        </aside>
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <div className="text-2xl font-bold">{value}</div>
      <div className="mt-1 text-sm text-muted">{label}</div>
    </div>
  );
}

function formatArea(value: unknown) {
  if (!value) return "-";
  return `${formatNumber(value)} qm`;
}

function formatNumber(value: unknown) {
  const number = Number(value || 0);
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(number);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}
