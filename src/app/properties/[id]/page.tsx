import Link from "next/link";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { DocumentThumbnail } from "@/components/DocumentThumbnail";
import { EditableField } from "@/components/EditableField";
import { PropertyImageGallery } from "@/components/PropertyImageGallery";
import { PropertyImageUpload } from "@/components/PropertyImageUpload";
import { TenancyCalendar } from "@/components/TenancyCalendar";
import { UploadForm } from "@/components/UploadForm";
import { requireUser } from "@/lib/auth";
import { brokerPropertyIds, canAccessDocument, tenantUnitId } from "@/lib/permissions";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";
import { formatPropertyAddress } from "@/lib/property-address";

export const dynamic = "force-dynamic";

export default async function PropertyDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const [property, energyCategory] = await Promise.all([
    prisma.property.findFirst({
      where: { id: params.id, ...portalWhere(user) },
      include: {
        units: { orderBy: { unitNumber: "asc" }, include: { tenants: true, contracts: true, documents: { include: { category: true } } } },
        documents: { orderBy: { createdAt: "desc" }, include: { category: true, unit: true } },
        brokerRequests: { include: { user: true } },
        brokerValuations: { include: { user: true }, orderBy: { updatedAt: "desc" } }
      }
    }),
    prisma.documentCategory.findFirst({ where: { name: "Energieausweis" } })
  ]);

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
  const totalRent = property.units.reduce((sum, unit) => sum + Number(unit.rentAmount || 0) + Number(unit.garageRent || 0), 0);
  const annualColdRent = totalRent * 12;
  const expectedPrice = Number(property.expectedPurchasePrice || 0);
  const outstandingLoan = Number(property.outstandingLoan || 0);
  const netValue = expectedPrice - outstandingLoan;
  const totalArea = property.units.reduce((sum, unit) => sum + Number(unit.livingArea || 0), 0);
  const occupiedUnits = property.units.filter((unit) => unit.status === "vermietet").length;
  const averageBrokerValuation = average(property.brokerValuations.map((valuation) => Number(valuation.amount || 0)).filter(Boolean));
  const energyDocuments = property.documents.filter((document) => document.category?.name === "Energieausweis");
  const propertyImages = visibleDocuments.filter((document) => document.isPropertyImage && document.mimeType.startsWith("image/"));
  const visibleRegularDocuments = visibleDocuments.filter((document) => !document.isPropertyImage);
  const displayAddress = formatPropertyAddress(property);

  return (
    <AppShell role={user.role} userId={user.id} email={user.email} canSwitchView={user.role === Role.ADMIN || Boolean(user.impersonatedByAdminId)}>
      <div className="mb-6">
        <Link className="text-sm font-semibold text-accent" href="/properties">Zurueck zu Immobilien</Link>
        <div className="mt-4 grid gap-3 sm:flex sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold">{property.name}</h1>
            <p className="mt-1 text-muted">{displayAddress || property.address}</p>
          </div>
          <span className="rounded-full bg-panel px-3 py-1 text-sm">{property.rentalStatus || "offen"}</span>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {canEdit ? <Metric label="Kaufpreisvorstellung" value={property.expectedPurchasePrice ? formatCurrency(Number(property.expectedPurchasePrice)) : "offen"} /> : null}
        {canEdit ? <Metric label="Valutiertes Darlehen" value={property.outstandingLoan ? formatCurrency(Number(property.outstandingLoan)) : "offen"} /> : null}
        {canEdit ? <Metric label="Nettowert" value={expectedPrice ? formatCurrency(netValue) : "offen"} /> : null}
        {canEdit ? <Metric label="Rendite" value={expectedPrice ? formatPercent(annualColdRent / expectedPrice) : "offen"} /> : null}
        {canEdit ? <Metric label="Gehebelte Rendite" value={netValue > 0 ? formatPercent(annualColdRent / netValue) : "offen"} /> : null}
        {canEdit ? <Metric label="Maklerschätzung Ø" value={averageBrokerValuation ? formatCurrency(averageBrokerValuation) : "offen"} /> : null}
        <Metric label="Einheiten" value={property.units.length} />
        <Metric label="Vermietet" value={`${occupiedUnits} / ${property.units.length}`} />
        <Metric label="Wohnflaeche" value={`${formatNumber(totalArea || property.livingArea)} qm`} />
        <Metric label="Kaltmiete gesamt inkl. Tiefgarage" value={`${formatCurrency(totalRent)}`} />
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-6">
          <section id="bilder" className="scroll-mt-6 rounded-lg border border-line p-4 sm:p-5">
            <div className="grid gap-3 sm:flex sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-bold">Bilder</h2>
                <p className="mt-1 text-sm text-muted">Objektfotos werden als Galerie angezeigt. Das Hauptbild erscheint in den Uebersichten.</p>
              </div>
              {canEdit ? <span className="rounded-full bg-panel px-3 py-1 text-xs font-semibold text-muted">{propertyImages.length} Bilder</span> : null}
            </div>
            <div className="mt-4">
              <PropertyImageGallery images={propertyImages.map((image) => ({ id: image.id, title: image.title, summary: image.summary || "", isPrimaryImage: image.isPrimaryImage }))} canEdit={canEdit} />
            </div>
            {canEdit ? (
              <div className="mt-4">
                <PropertyImageUpload propertyId={property.id} hasPrimaryImage={propertyImages.some((image) => image.isPrimaryImage)} />
              </div>
            ) : null}
          </section>

          <section className="rounded-lg border border-line p-4 sm:p-5">
            <h2 className="text-xl font-bold">Objektdaten</h2>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <EditableField canEdit={canEdit} endpoint={propertyEndpoint} field="name" label="Objektname" value={property.name} />
              <EditableField canEdit={canEdit} endpoint={propertyEndpoint} field="address" label="Adresse frei lesbar" value={property.address} />
              <EditableField canEdit={canEdit} endpoint={propertyEndpoint} field="street" label="Straße" value={property.street || ""} />
              <EditableField canEdit={canEdit} endpoint={propertyEndpoint} field="houseNumber" label="Hausnummer" value={property.houseNumber || ""} />
              <EditableField canEdit={canEdit} endpoint={propertyEndpoint} field="postalCode" label="PLZ" value={property.postalCode || ""} />
              <EditableField canEdit={canEdit} endpoint={propertyEndpoint} field="city" label="Ort" value={property.city || ""} />
              <EditableField canEdit={canEdit} endpoint={propertyEndpoint} field="country" label="Land" value={property.country || "Deutschland"} />
              <EditableField canEdit={canEdit} endpoint={propertyEndpoint} field="latitude" label="Breitengrad" type="number" value={property.latitude?.toString() || ""} />
              <EditableField canEdit={canEdit} endpoint={propertyEndpoint} field="longitude" label="Längengrad" type="number" value={property.longitude?.toString() || ""} />
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
              {canEdit ? <EditableField canEdit={canEdit} endpoint={propertyEndpoint} field="expectedPurchasePrice" label="Kaufpreisvorstellung" type="number" value={property.expectedPurchasePrice?.toString() || ""} displayValue={property.expectedPurchasePrice ? formatCurrency(Number(property.expectedPurchasePrice)) : ""} /> : null}
              {canEdit ? <EditableField canEdit={canEdit} endpoint={propertyEndpoint} field="outstandingLoan" label="Valutiertes Darlehen" type="number" value={property.outstandingLoan?.toString() || ""} displayValue={property.outstandingLoan ? formatCurrency(Number(property.outstandingLoan)) : ""} /> : null}
            </div>
            <div className="mt-4 grid gap-3 text-sm">
              <EditableField canEdit={canEdit} endpoint={propertyEndpoint} field="modernizations" label="Modernisierungen" type="textarea" value={property.modernizations || ""} />
              <EditableField canEdit={canEdit} endpoint={propertyEndpoint} field="internalNotes" label="Interne Notizen" type="textarea" value={property.internalNotes || ""} />
            </div>
          </section>

          {canEdit ? (
            <section className="rounded-lg border border-line p-4 sm:p-5">
              <h2 className="text-xl font-bold">Energieausweis</h2>
              <p className="mt-1 text-sm text-muted">Der Textwert beschreibt den Ausweis, die Datei wird als geschuetztes Dokument direkt dieser Immobilie zugeordnet.</p>
              <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_320px]">
                <div className="grid gap-2">
                  {energyDocuments.length ? energyDocuments.map((document) => (
                    <div className="grid gap-3 rounded-md bg-panel p-3 text-sm sm:grid-cols-[96px_minmax(0,1fr)_120px]" key={document.id}>
                      <DocumentThumbnail id={document.id} title={document.title} mimeType={document.mimeType} hasFile={Boolean(document.storagePath)} compact />
                      <div>
                        <div className="font-semibold">{document.title}</div>
                        <div className="text-muted">{new Intl.DateTimeFormat("de-DE").format(document.createdAt)}</div>
                      </div>
                      <a className="button text-center" href={`/api/documents/${document.id}/download`}>Download</a>
                    </div>
                  )) : <div className="rounded-md bg-panel p-3 text-sm text-muted">Noch kein Energieausweis hochgeladen.</div>}
                </div>
                <UploadForm endpoint="/api/documents" submitLabel="Energieausweis hochladen">
                  <input type="hidden" name="propertyId" value={property.id} />
                  <input type="hidden" name="scope" value="PROPERTY" />
                  <input type="hidden" name="categoryId" value={energyCategory?.id || ""} />
                  <input type="hidden" name="title" value={`Energieausweis ${property.name}`} />
                </UploadForm>
              </div>
            </section>
          ) : null}

          <section className="rounded-lg border border-line">
            <div className="border-b border-line p-4 font-bold">Einheiten</div>
            {property.units.length ? property.units.map((unit) => (
              <div key={unit.id} className="grid gap-3 border-b border-line p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <EditableField canEdit={canEdit} endpoint={`/api/units/${unit.id}`} field="unitNumber" label="Einheit" value={unit.unitNumber} />
                <EditableField canEdit={canEdit} endpoint={`/api/units/${unit.id}`} field="floor" label="Etage" value={unit.floor || ""} />
                <EditableField canEdit={canEdit} endpoint={`/api/units/${unit.id}`} field="rooms" label="Zimmer" type="number" value={unit.rooms?.toString() || ""} />
                <EditableField canEdit={canEdit} endpoint={`/api/units/${unit.id}`} field="livingArea" label="Wohnflaeche" type="number" suffix=" qm" value={unit.livingArea?.toString() || ""} />
                <EditableField canEdit={canEdit} endpoint={`/api/units/${unit.id}`} field="rentAmount" label="Kaltmiete" type="number" suffix=" EUR" value={unit.rentAmount?.toString() || ""} />
                <EditableField canEdit={canEdit} endpoint={`/api/units/${unit.id}`} field="garageRent" label="Tiefgarage" type="select" suffix=" EUR" value={unit.garageRent?.toString() || ""} options={["0", "50", "75", "80", "90", "100", "120", "150"]} />
                <EditableField canEdit={canEdit} endpoint={`/api/units/${unit.id}`} field="serviceCharges" label="Nebenkosten" type="number" suffix=" EUR" value={unit.serviceCharges?.toString() || ""} />
                <EditableField canEdit={canEdit} endpoint={`/api/units/${unit.id}`} field="warmRent" label="Warmmiete" type="number" suffix=" EUR" value={unit.warmRent?.toString() || calculatedWarmRent(unit)} displayValue={formatCurrency(Number(unit.rentAmount || 0) + Number(unit.garageRent || 0) + Number(unit.serviceCharges || 0))} />
                <EditableField canEdit={canEdit} endpoint={`/api/units/${unit.id}`} field="status" label="Status" type="select" options={["vermietet", "frei", "reserviert"]} value={unit.status || ""} />
                <EditableField canEdit={canEdit} endpoint={`/api/units/${unit.id}`} field="isSharedHousing" label="WG / mehrere laufende Mietverträge" type="checkbox" value={unit.isSharedHousing ? "true" : "false"} />
                <div className="rounded-md bg-panel p-3">
                  <div className="text-xs font-semibold uppercase text-muted">{unit.isSharedHousing ? "Aktuelle Mieter" : "Aktueller Mieter"}</div>
                  <div className="mt-1">{currentTenant(unit.tenants)}</div>
                </div>
                {canEdit ? <Link className="button-secondary flex items-center justify-center text-center" href={`/documents?unitId=${unit.id}&category=nebenkosten`}>Nebenkostenabrechnung hochladen</Link> : null}
              </div>
            )) : <div className="p-4 text-sm text-muted">Noch keine Einheiten angelegt.</div>}
          </section>

          <TenancyCalendar units={property.units} />

          <section className="rounded-lg border border-line">
            <div className="border-b border-line p-4 font-bold">Dokumente</div>
            {visibleRegularDocuments.length ? visibleRegularDocuments.map((document) => (
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
                    <Link className="mt-2 inline-flex text-xs font-semibold text-accent hover:underline" href="/users">Zugriff bearbeiten</Link>
                  </div>
                )) : <div className="text-muted">Keine Makler freigegeben.</div>}
              </div>
              <Link className="button-secondary mt-3 block text-center" href="/users">Alle Maklerrechte verwalten</Link>
            </section>
          ) : null}
          {canEdit ? (
            <section className="rounded-lg border border-line bg-panel p-4">
              <h2 className="text-lg font-bold">Kaufpreisschätzungen</h2>
              <div className="mt-3 grid gap-2 text-sm">
                {property.brokerValuations.length ? property.brokerValuations.map((valuation) => (
                  <div key={valuation.id} className="rounded-md bg-white p-3">
                    <div className="font-semibold">{valuation.user.name || valuation.user.email}</div>
                    <div className="mt-1 text-lg font-bold">{valuation.amount ? formatCurrency(Number(valuation.amount)) : "Noch kein Betrag"}</div>
                    {valuation.note ? <div className="mt-1 text-muted">{valuation.note}</div> : null}
                    <div className="mt-1 text-xs text-muted">{new Intl.DateTimeFormat("de-DE").format(valuation.updatedAt)}</div>
                  </div>
                )) : <div className="text-muted">Noch keine Makler-Schaetzung vorhanden.</div>}
              </div>
            </section>
          ) : null}
          {canEdit ? <section className="rounded-lg border border-line bg-panel p-4">
            <h2 className="text-lg font-bold">Schnellaktionen</h2>
            <div className="mt-3 grid gap-2">
              <Link className="button block text-center" href={`/documents?propertyId=${property.id}`}>Dokument fuer dieses Objekt</Link>
              <Link className="button button-secondary block text-center" href="/users">Makler oder Mieter anlegen</Link>
              <Link className="button button-secondary block text-center" href={`/contracts?propertyId=${property.id}`}>Vertrag fuer dieses Objekt</Link>
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
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function calculatedWarmRent(unit: { rentAmount: unknown; garageRent: unknown; serviceCharges: unknown }) {
  const total = Number(unit.rentAmount || 0) + Number(unit.garageRent || 0) + Number(unit.serviceCharges || 0);
  return total ? String(total) : "";
}

function currentTenant(tenants: Array<{ firstName: string; lastName: string; isCurrent: boolean }>) {
  const current = tenants.filter((item) => item.isCurrent);
  return current.length ? current.map((tenant) => `${tenant.firstName} ${tenant.lastName}`.trim()).join(", ") : "-";
}
