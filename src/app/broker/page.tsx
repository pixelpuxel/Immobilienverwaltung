import { Role } from "@prisma/client";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { BrokerValuationForm } from "@/components/BrokerValuationForm";
import { DocumentThumbnail } from "@/components/DocumentThumbnail";
import { requireUser } from "@/lib/auth";
import { brokerPropertyIds, brokerVisibleDocumentWhere } from "@/lib/permissions";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const brokerAnalysisLabels = {
  kaltmiete: {
    title: "Kaltmiete",
    description: "Monatliche und jaehrliche Kaltmiete der freigegebenen Immobilien inklusive Tiefgarage, ohne Nebenkosten.",
    valueLabel: "Kaltmiete / Monat"
  },
  warmmiete: {
    title: "Warmmiete",
    description: "Monatliche und jaehrliche Warmmiete der freigegebenen Immobilien inklusive Nebenkosten.",
    valueLabel: "Warmmiete / Monat"
  }
} as const;

type BrokerAnalysisKey = keyof typeof brokerAnalysisLabels;
type BrokerSortKey = "name" | "value" | "annualColdRent" | "annualWarmRent";
type SortDirection = "asc" | "desc";

export default async function BrokerPage({
  searchParams
}: {
  searchParams?: { auswertung?: string; sort?: string; richtung?: string };
}) {
  const user = await requireUser([Role.BROKER, Role.ADMIN]);
  const propertyIds = user.role === Role.ADMIN ? undefined : await brokerPropertyIds(user.id);
  const [properties, owner] = await Promise.all([
    prisma.property.findMany({
    where: { ...portalWhere(user), ...(propertyIds ? { id: { in: propertyIds } } : {}) },
    include: {
      units: {
        orderBy: { unitNumber: "asc" },
        include: {
          tenants: { where: { isCurrent: true }, include: { user: true }, orderBy: { moveInDate: "desc" } },
          contracts: { include: { tenantProfile: true }, orderBy: { createdAt: "desc" } },
          documents: { include: { category: true }, orderBy: { createdAt: "desc" } }
        }
      },
      documents: {
        where: user.role === Role.ADMIN ? undefined : brokerVisibleDocumentWhere(user.id, propertyIds || []),
        include: { category: true, permissions: true }
      },
      brokerValuations: user.role === Role.BROKER ? { where: { userId: user.id } } : true
    }
    }),
    prisma.user.findFirst({ where: { role: Role.ADMIN, active: true, ...portalWhere(user) }, orderBy: { createdAt: "asc" } })
  ]);
  const ownerMail = owner?.contactEmail || owner?.email || "admin@example.com";
  const activeAnalysis = brokerAnalysisKey(searchParams?.auswertung);
  const activeSort = brokerSortKey(searchParams?.sort);
  const activeDirection = sortDirection(searchParams?.richtung);
  const analysisRows = properties.map((property) => {
    const coldMonthly = property.units.reduce((sum, unit) => sum + Number(unit.rentAmount || 0) + Number(unit.garageRent || 0), 0);
    const warmMonthly = property.units.reduce((sum, unit) => sum + Number(unit.rentAmount || 0) + Number(unit.garageRent || 0) + Number(unit.serviceCharges || 0), 0);
    return {
      id: property.id,
      name: property.name,
      address: property.address,
      unitCount: property.units.length,
      coldMonthly,
      warmMonthly,
      annualColdRent: coldMonthly * 12,
      annualWarmRent: warmMonthly * 12
    };
  });
  return (
    <AppShell role={user.role} userId={user.id} email={user.email} canSwitchView={user.role === Role.ADMIN || Boolean(user.impersonatedByAdminId)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Immobilien</h1>
          {activeAnalysis ? <p className="mt-1 text-sm text-muted">Auswertung: {brokerAnalysisLabels[activeAnalysis].title}</p> : null}
        </div>
        {activeAnalysis ? <Link className="button-secondary px-3 py-2 text-sm" href="/broker">Auswertung schliessen</Link> : null}
      </div>
      {activeAnalysis ? <BrokerAnalysisTable direction={activeDirection} rows={analysisRows} sortKey={activeSort} type={activeAnalysis} /> : null}
      <div className="mt-6 grid gap-4">
        {properties.map((property) => (
          <BrokerPropertyCard key={property.id} property={property} owner={owner} ownerMail={ownerMail} userRole={user.role} />
        ))}
      </div>
    </AppShell>
  );
}

type BrokerProperty = {
  id: string;
  name: string;
  address: string;
  objectType: string | null;
  constructionYear: number | null;
  livingArea: unknown;
  rentalStatus: string | null;
  units: Array<{
    id: string;
    unitNumber: string;
    livingArea: unknown;
    status: string | null;
    rentAmount: unknown;
    garageRent: unknown;
    serviceCharges: unknown;
    tenants: Array<{ id: string; firstName: string; lastName: string; email: string; phone: string | null }>;
    contracts: Array<{ id: string; tenantProfile: { firstName: string; lastName: string } }>;
  }>;
  documents: Array<{
    id: string;
    title: string;
    mimeType: string;
    storagePath: string;
    status: string;
    isPropertyImage: boolean;
    isPrimaryImage: boolean;
    summary: string | null;
    category: { name: string } | null;
  }>;
  brokerValuations: Array<{ amount: unknown; note: string | null }>;
};

function BrokerPropertyCard({
  property,
  owner,
  ownerMail,
  userRole
}: {
  property: BrokerProperty;
  owner: { name: string | null; contactPerson: string | null; contactPhone: string | null; contactAddress: string | null } | null;
  ownerMail: string;
  userRole: Role;
}) {
  const propertyImages = property.documents.filter((document) => document.isPropertyImage);
  const primaryImage = propertyImages.find((document) => document.isPrimaryImage) || propertyImages[0];
  const salesDocuments = property.documents.filter((document) => !document.isPropertyImage);

  return (
          <details className="group overflow-hidden rounded-lg border border-line bg-white shadow-sm transition hover:border-accent/40 hover:shadow-md [&:not([open])>div]:hidden" key={property.id}>
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 border-b border-line bg-gradient-to-r from-emerald-50 via-white to-sky-50 px-4 py-3">
              <span className="flex min-w-0 items-center gap-3">
                {primaryImage ? (
                  <span className="h-12 w-12 shrink-0 overflow-hidden rounded-md border border-line bg-white shadow-sm">
                    <img className="h-full w-full object-cover" src={`/api/documents/${primaryImage.id}/preview`} alt={`Hauptbild ${property.name}`} loading="lazy" />
                  </span>
                ) : null}
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-accent text-lg font-black leading-none text-white shadow-sm">
                  <span className="transition-transform group-open:rotate-90">›</span>
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-lg font-bold">{property.name}</span>
                  <span className="text-xs font-semibold text-muted">
                    <span className="group-open:hidden">{property.address || "Keine Adresse hinterlegt"}</span>
                    <span className="hidden group-open:inline">Objektdaten werden angezeigt</span>
                  </span>
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-muted shadow-sm">{property.units.length} Einheiten</span>
                <span className="rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-muted shadow-sm">{salesDocuments.length} Unterlagen</span>
                {propertyImages.length ? <span className="rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-muted shadow-sm">{propertyImages.length} Bilder</span> : null}
                <span className="rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-muted shadow-sm">{property.rentalStatus || "offen"}</span>
              </span>
            </summary>
            <div className="p-4 sm:p-5">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                <div>
                  <h2 className="text-xl font-bold">{property.name}</h2>
                  <p className="text-muted">{property.address}</p>
                </div>
                <Link className="button text-center" href={`/properties/${property.id}`}>Detail ansehen</Link>
              </div>

              {propertyImages.length ? (
                <section className="mt-5">
                  <h3 className="font-bold">Bilder</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {propertyImages.slice(0, 8).map((image) => (
                      <a className="block overflow-hidden rounded-md border border-line bg-panel" href={`/api/documents/${image.id}/preview`} target="_blank" rel="noreferrer" key={image.id}>
                        <img className="aspect-[4/3] w-full object-cover" src={`/api/documents/${image.id}/preview`} alt={image.title} loading="lazy" />
                        <span className="block px-3 py-2 text-sm">
                          <span className="block truncate font-semibold">{image.title}</span>
                          {image.summary ? <span className="mt-1 block line-clamp-2 text-xs text-muted">{image.summary}</span> : null}
                        </span>
                      </a>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <Info label="Typ" value={property.objectType || "offen"} />
                <Info label="Baujahr" value={property.constructionYear?.toString() || "offen"} />
                <Info label="Wohnflaeche" value={property.livingArea ? `${property.livingArea} qm` : "offen"} />
                <Info label="Status" value={property.rentalStatus || "offen"} />
              </section>

              <section className="mt-6">
                <h3 className="font-bold">Einheiten und aktuelle Mieter</h3>
                <div className="mt-3 grid gap-3">
                  {property.units.map((unit) => (
                    <div className="rounded-md bg-panel p-3 text-sm" key={unit.id}>
                      <div className="font-semibold">{unit.unitNumber} · {unit.livingArea?.toString() || "?"} qm · {unit.status || "offen"}</div>
                      <div className="mt-1 text-muted">
                        Kaltmiete: {money(Number(unit.rentAmount || 0) + Number(unit.garageRent || 0))} · Tiefgarage: {money(unit.garageRent)} · Nebenkosten: {money(unit.serviceCharges)} · Warmmiete: {money(Number(unit.rentAmount || 0) + Number(unit.garageRent || 0) + Number(unit.serviceCharges || 0))}
                      </div>
                      {unit.tenants.length ? unit.tenants.map((tenant) => (
                        <div className="mt-2 grid gap-1 text-muted sm:grid-cols-3" key={tenant.id}>
                          <span>{tenant.firstName} {tenant.lastName}</span>
                          <a href={`mailto:${tenant.email}`}>{tenant.email}</a>
                          <span>{tenant.phone || "keine Telefonnummer"}</span>
                        </div>
                      )) : <div className="mt-2 text-muted">Kein aktueller Mieter hinterlegt.</div>}
                      {unit.contracts.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {unit.contracts.map((contract) => (
                            <a className="button-secondary px-3 py-2 text-xs" href={`/api/contracts/${contract.id}/preview`} target="_blank" rel="noreferrer" key={contract.id}>
                              Mietvertrag {contract.tenantProfile.lastName || contract.tenantProfile.firstName}
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>

              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <section>
                  <h3 className="font-bold">Verkaufsunterlagen</h3>
                  <div className="mt-3 grid gap-2">
                    {salesDocuments.length ? salesDocuments.map((doc) => (
                      <div key={doc.id} className="grid gap-3 rounded-md bg-panel p-3 text-sm sm:grid-cols-[92px_minmax(0,1fr)_130px]">
                        <DocumentThumbnail id={doc.id} title={doc.title} mimeType={doc.mimeType} hasFile={Boolean(doc.storagePath)} compact />
                        <span>{doc.title} · {doc.category?.name || "ohne Kategorie"} · {doc.status}</span>
                        <a className="button text-center" href={`/api/documents/${doc.id}/download`}>Download</a>
                      </div>
                    )) : <div className="text-sm text-muted">Hier erscheinen freigegebene Verkaufsunterlagen wie Grundbuch, Energieausweis, Pläne, Exposé, Ertragsnachweise und Mietverträge.</div>}
                  </div>
                </section>
                <div className="grid gap-4">
                  {userRole === Role.BROKER ? (
                    <BrokerValuationForm
                      propertyId={property.id}
                      defaultAmount={property.brokerValuations[0]?.amount?.toString() || ""}
                      defaultNote={property.brokerValuations[0]?.note || ""}
                    />
                  ) : null}
                  <section className="rounded-md bg-panel p-4">
                    <h3 className="font-bold">Kontakt zum Eigentümer</h3>
                    <p className="mt-2 text-sm text-muted">Fehlende Unterlagen oder Informationen zur Immobilie anfordern.</p>
                    <div className="mt-3 text-sm text-muted">
                      <div>{owner?.contactPerson || owner?.name || "Eigentümer"}</div>
                      {owner?.contactPhone ? <div>{owner.contactPhone}</div> : null}
                      {owner?.contactAddress ? <div>{owner.contactAddress}</div> : null}
                    </div>
                    <div className="mt-4 grid gap-2">
                      <a className="button text-center" href={`mailto:${ownerMail}?subject=Rueckfrage%20${encodeURIComponent(property.name)}`}>Nachricht senden</a>
                      <a className="button-secondary text-center" href={`mailto:${ownerMail}?subject=Unterlagen%20anfordern%20${encodeURIComponent(property.name)}`}>Unterlagen anfordern</a>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </details>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-panel p-3">
      <div className="text-xs font-semibold text-muted">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}

function money(value: unknown) {
  if (value === null || value === undefined) return "offen";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(value));
}

function brokerAnalysisKey(value?: string): BrokerAnalysisKey | null {
  return value && value in brokerAnalysisLabels ? value as BrokerAnalysisKey : null;
}

function brokerSortKey(value?: string): BrokerSortKey {
  return value === "name" || value === "annualColdRent" || value === "annualWarmRent" || value === "value" ? value : "value";
}

function sortDirection(value?: string): SortDirection {
  return value === "asc" ? "asc" : "desc";
}

function BrokerAnalysisTable({
  direction,
  rows,
  sortKey,
  type
}: {
  direction: SortDirection;
  rows: Array<{
    id: string;
    name: string;
    address: string;
    unitCount: number;
    coldMonthly: number;
    warmMonthly: number;
    annualColdRent: number;
    annualWarmRent: number;
  }>;
  sortKey: BrokerSortKey;
  type: BrokerAnalysisKey;
}) {
  const config = brokerAnalysisLabels[type];
  const sortedRows = [...rows].sort((a, b) => compareAnalysisRows(a, b, type, sortKey, direction));
  const monthlyTotal = rows.reduce((sum, row) => sum + (type === "kaltmiete" ? row.coldMonthly : row.warmMonthly), 0);
  const annualTotal = rows.reduce((sum, row) => sum + (type === "kaltmiete" ? row.annualColdRent : row.annualWarmRent), 0);
  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-line bg-white shadow-sm">
      <div className="border-b border-line bg-[linear-gradient(90deg,#ecfdf5,#eff6ff)] p-4">
        <h2 className="text-xl font-bold">{config.title}</h2>
        <p className="mt-1 text-sm text-muted">{config.description}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-panel text-xs uppercase text-muted">
            <tr>
              <BrokerSortableHeader activeDirection={direction} activeSort={sortKey} label="Immobilie" sort="name" type={type} />
              <BrokerSortableHeader activeDirection={direction} activeSort={sortKey} align="right" label={config.valueLabel} sort="value" type={type} />
              <BrokerSortableHeader activeDirection={direction} activeSort={sortKey} align="right" label="Kaltmiete / Jahr" sort="annualColdRent" type={type} />
              <BrokerSortableHeader activeDirection={direction} activeSort={sortKey} align="right" label="Warmmiete / Jahr" sort="annualWarmRent" type={type} />
              <th className="px-4 py-3 text-right">Einheiten</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sortedRows.map((row) => (
              <tr className="hover:bg-panel/60" key={row.id}>
                <td className="px-4 py-3">
                  <Link className="font-semibold text-accent hover:underline" href={`/properties/${row.id}`}>{row.name}</Link>
                  <div className="mt-1 text-xs text-muted">{row.address || "Keine Adresse hinterlegt"}</div>
                </td>
                <td className="px-4 py-3 text-right font-semibold">{money(type === "kaltmiete" ? row.coldMonthly : row.warmMonthly)}</td>
                <td className="px-4 py-3 text-right text-muted">{money(row.annualColdRent)}</td>
                <td className="px-4 py-3 text-right text-muted">{money(row.annualWarmRent)}</td>
                <td className="px-4 py-3 text-right text-muted">{row.unitCount}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-line bg-panel font-bold">
            <tr>
              <td className="px-4 py-3">Summe</td>
              <td className="px-4 py-3 text-right">{money(monthlyTotal)} / Monat</td>
              <td className="px-4 py-3 text-right">{money(rows.reduce((sum, row) => sum + row.annualColdRent, 0))}</td>
              <td className="px-4 py-3 text-right">{money(rows.reduce((sum, row) => sum + row.annualWarmRent, 0))}</td>
              <td className="px-4 py-3 text-right">{rows.reduce((sum, row) => sum + row.unitCount, 0)}</td>
            </tr>
            <tr>
              <td className="px-4 py-3 text-sm text-muted" colSpan={5}>Aktuelle Auswertung: {money(annualTotal)} / Jahr</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function BrokerSortableHeader({
  activeDirection,
  activeSort,
  align = "left",
  label,
  sort,
  type
}: {
  activeDirection: SortDirection;
  activeSort: BrokerSortKey;
  align?: "left" | "right";
  label: string;
  sort: BrokerSortKey;
  type: BrokerAnalysisKey;
}) {
  const isActive = activeSort === sort;
  const nextDirection: SortDirection = isActive && activeDirection === "desc" ? "asc" : "desc";
  const indicator = isActive ? (activeDirection === "desc" ? "↓" : "↑") : "↕";
  return (
    <th className={`px-4 py-3 ${align === "right" ? "text-right" : ""}`}>
      <Link className={`inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-white hover:text-ink ${align === "right" ? "justify-end" : ""}`} href={`/broker?auswertung=${type}&sort=${sort}&richtung=${nextDirection}`}>
        <span>{label}</span>
        <span aria-hidden="true" className={isActive ? "text-accent" : "text-muted/70"}>{indicator}</span>
      </Link>
    </th>
  );
}

function compareAnalysisRows(
  a: { name: string; address: string; coldMonthly: number; warmMonthly: number; annualColdRent: number; annualWarmRent: number },
  b: { name: string; address: string; coldMonthly: number; warmMonthly: number; annualColdRent: number; annualWarmRent: number },
  type: BrokerAnalysisKey,
  sortKey: BrokerSortKey,
  direction: SortDirection
) {
  const factor = direction === "asc" ? 1 : -1;
  if (sortKey === "name") {
    const byName = a.name.localeCompare(b.name, "de", { sensitivity: "base" });
    if (byName !== 0) return byName * factor;
    return a.address.localeCompare(b.address, "de", { sensitivity: "base" }) * factor;
  }
  const left = sortKey === "annualColdRent"
    ? a.annualColdRent
    : sortKey === "annualWarmRent"
      ? a.annualWarmRent
      : type === "kaltmiete"
        ? a.coldMonthly
        : a.warmMonthly;
  const right = sortKey === "annualColdRent"
    ? b.annualColdRent
    : sortKey === "annualWarmRent"
      ? b.annualWarmRent
      : type === "kaltmiete"
        ? b.coldMonthly
        : b.warmMonthly;
  if (left === right) return a.name.localeCompare(b.name, "de", { sensitivity: "base" });
  return (left - right) * factor;
}
