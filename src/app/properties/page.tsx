import { Role } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { JsonForm } from "@/components/JsonForm";
import { PropertyManager } from "@/components/PropertyManager";
import { requireUser } from "@/lib/auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const rentalStatuses = ["offen", "frei", "teilvermietet", "voll vermietet", "leerstehend", "reserviert", "in Sanierung"];
const analysisLabels = {
  immobilienwert: {
    title: "Immobilienwert",
    description: "Kaufpreisvorstellung je Immobilie und Summe ueber alle Objekte.",
    valueLabel: "Kaufpreisvorstellung"
  },
  darlehen: {
    title: "Valutierte Darlehen",
    description: "Noch offene Darlehenssumme je Immobilie.",
    valueLabel: "Valutiertes Darlehen"
  },
  nettowert: {
    title: "Nettowert",
    description: "Kaufpreisvorstellung abzüglich valutiertem Darlehen.",
    valueLabel: "Nettowert"
  },
  rendite: {
    title: "Rendite",
    description: "Jahreskaltmiete geteilt durch Kaufpreisvorstellung.",
    valueLabel: "Rendite"
  },
  "gehebelte-rendite": {
    title: "Gehebelte Rendite",
    description: "Jahreskaltmiete geteilt durch Nettowert.",
    valueLabel: "Gehebelte Rendite"
  },
  kaltmiete: {
    title: "Kaltmiete",
    description: "Monatliche und jährliche Kaltmiete inklusive Tiefgarage, ohne Nebenkosten.",
    valueLabel: "Kaltmiete / Monat"
  },
  warmmiete: {
    title: "Warmmiete",
    description: "Monatliche und jährliche Warmmiete inklusive Nebenkosten.",
    valueLabel: "Warmmiete / Monat"
  }
} as const;

type AnalysisKey = keyof typeof analysisLabels;
type AnalysisSortKey = "name" | "value" | "propertyValue" | "loanValue" | "annualColdRent";
type SortDirection = "asc" | "desc";
type PropertyAnalysisRow = {
  id: string;
  name: string;
  address: string;
  propertyValue: number;
  loanValue: number;
  netValue: number;
  coldMonthly: number;
  warmMonthly: number;
  annualColdRent: number;
  yieldValue: number | null;
  leveragedYield: number | null;
};

export default async function PropertiesPage({
  searchParams
}: {
  searchParams?: { auswertung?: string; sort?: string; richtung?: string };
}) {
  const user = await requireUser([Role.ADMIN]);
  const properties = await prisma.property.findMany({ where: portalWhere(user), include: { units: true, documents: true }, orderBy: { createdAt: "desc" } });
  const propertyItems = properties.map((property) => ({
    id: property.id,
    name: property.name,
    address: property.address,
    street: property.street || "",
    houseNumber: property.houseNumber || "",
    postalCode: property.postalCode || "",
    city: property.city || "",
    country: property.country || "",
    latitude: property.latitude?.toString() || "",
    longitude: property.longitude?.toString() || "",
    objectType: property.objectType || "",
    constructionYear: property.constructionYear?.toString() || "",
    livingArea: property.livingArea?.toString() || "",
    unitCount: property.unitCount.toString(),
    rentalStatus: property.rentalStatus || "",
    expectedPurchasePrice: property.expectedPurchasePrice?.toString() || "",
    outstandingLoan: property.outstandingLoan?.toString() || "",
    annualColdRent: property.units.reduce((sum, unit) => sum + Number(unit.rentAmount || 0) + Number(unit.garageRent || 0), 0) * 12,
    internalNotes: property.internalNotes || "",
    documents: property.documents.length,
    primaryImageId: property.documents.find((document) => document.isPropertyImage && document.isPrimaryImage)?.id
      || property.documents.find((document) => document.isPropertyImage)?.id
      || ""
  }));
  const activeAnalysis = analysisKey(searchParams?.auswertung);
  const activeSort = analysisSortKey(searchParams?.sort);
  const activeDirection = sortDirection(searchParams?.richtung);
  const analysisRows = properties.map((property) => {
    const coldMonthly = property.units.reduce((sum, unit) => sum + Number(unit.rentAmount || 0) + Number(unit.garageRent || 0), 0);
    const warmMonthly = property.units.reduce((sum, unit) => sum + Number(unit.rentAmount || 0) + Number(unit.garageRent || 0) + Number(unit.serviceCharges || 0), 0);
    const propertyValue = Number(property.expectedPurchasePrice || 0);
    const loanValue = Number(property.outstandingLoan || 0);
    const netValue = propertyValue - loanValue;
    const annualColdRent = coldMonthly * 12;
    return {
      id: property.id,
      name: property.name,
      address: property.address,
      propertyValue,
      loanValue,
      netValue,
      coldMonthly,
      warmMonthly,
      annualColdRent,
      yieldValue: propertyValue > 0 ? annualColdRent / propertyValue : null,
      leveragedYield: netValue > 0 ? annualColdRent / netValue : null
    };
  });
  return (
    <AppShell role={user.role} userId={user.id} email={user.email} canSwitchView={user.role === Role.ADMIN || Boolean(user.impersonatedByAdminId)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Immobilien</h1>
          {activeAnalysis ? <p className="mt-1 text-sm text-muted">Auswertung: {analysisLabels[activeAnalysis].title}</p> : null}
        </div>
        {activeAnalysis ? <a className="button-secondary px-3 py-2 text-sm" href="/properties">Auswertung schliessen</a> : null}
      </div>
      {activeAnalysis ? <PropertyAnalysisTable direction={activeDirection} sortKey={activeSort} type={activeAnalysis} rows={analysisRows} /> : null}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_420px]">
        <PropertyManager properties={propertyItems} />
        <JsonForm endpoint="/api/properties" submitLabel="Immobilie anlegen">
          <label>Objektname <span className="text-accent">*</span><input name="name" required /></label>
          <label>Adresse frei lesbar<input name="address" placeholder="z. B. Musterstraße 12, 12345 Musterstadt" /></label>
          <label>Straße<input name="street" /></label>
          <label>Hausnummer<input name="houseNumber" /></label>
          <label>PLZ<input name="postalCode" inputMode="numeric" /></label>
          <label>Ort<input name="city" /></label>
          <label>Land<input name="country" defaultValue="Deutschland" /></label>
          <label>Breitengrad<input name="latitude" type="number" step="0.000001" placeholder="z. B. 50.002" /></label>
          <label>Längengrad<input name="longitude" type="number" step="0.000001" placeholder="z. B. 8.0011" /></label>
          <label>Objekttyp<input name="objectType" /></label>
          <label>Baujahr<input name="constructionYear" type="number" /></label>
          <label>Wohnflaeche<input name="livingArea" type="number" step="0.01" /></label>
          <label>Nutzflaeche<input name="usableArea" type="number" step="0.01" /></label>
          <label>Grundstuecksflaeche<input name="plotArea" type="number" step="0.01" /></label>
          <label>Anzahl Zimmer<input name="rooms" type="number" step="0.5" /></label>
          <label>Anzahl Einheiten<input name="unitCount" type="number" /></label>
          <label>Etage<input name="floor" /></label>
          <label>Stellplaetze<input name="parkingSpaces" type="number" /></label>
          <label>Energieausweis<input name="energyCertificate" /></label>
          <label>Heizungsart<input name="heatingType" /></label>
          <label>Zustand<input name="condition" /></label>
          <label>Modernisierungen<textarea name="modernizations" /></label>
          <label>Vermietungsstatus<select name="rentalStatus" defaultValue="offen">{rentalStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
          <label>Kaufpreisvorstellung<input name="expectedPurchasePrice" type="number" step="0.01" /></label>
          <label>Valutiertes Darlehen<input name="outstandingLoan" type="number" step="0.01" /></label>
          <label>Interne Notizen<textarea name="internalNotes" /></label>
        </JsonForm>
      </div>
    </AppShell>
  );
}

function analysisKey(value?: string): AnalysisKey | null {
  return value && value in analysisLabels ? value as AnalysisKey : null;
}

function analysisSortKey(value?: string): AnalysisSortKey {
  return value === "name" || value === "propertyValue" || value === "loanValue" || value === "annualColdRent" || value === "value" ? value : "value";
}

function sortDirection(value?: string): SortDirection {
  return value === "asc" ? "asc" : "desc";
}

function PropertyAnalysisTable({
  direction,
  rows,
  sortKey,
  type
}: {
  direction: SortDirection;
  rows: PropertyAnalysisRow[];
  sortKey: AnalysisSortKey;
  type: AnalysisKey;
}) {
  const config = analysisLabels[type];
  const sortedRows = [...rows].sort((a, b) => compareRows(a, b, type, sortKey, direction));
  const total = totalValue(rows, type);
  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-line bg-white shadow-sm">
      <div className="border-b border-line bg-[linear-gradient(90deg,#ecfdf5,#eff6ff)] p-4">
        <h2 className="text-xl font-bold">{config.title}</h2>
        <p className="mt-1 text-sm text-muted">{config.description}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-panel text-xs uppercase text-muted">
            <tr>
              <SortableHeader activeDirection={direction} activeSort={sortKey} label="Immobilie" sort="name" type={type} />
              <SortableHeader activeDirection={direction} activeSort={sortKey} align="right" label={config.valueLabel} sort="value" type={type} />
              <SortableHeader activeDirection={direction} activeSort={sortKey} align="right" label="Kaufpreis" sort="propertyValue" type={type} />
              <SortableHeader activeDirection={direction} activeSort={sortKey} align="right" label="Darlehen" sort="loanValue" type={type} />
              <SortableHeader activeDirection={direction} activeSort={sortKey} align="right" label="Jahreskaltmiete" sort="annualColdRent" type={type} />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sortedRows.map((row) => (
              <tr key={row.id} className="hover:bg-panel/60">
                <td className="px-4 py-3">
                  <a className="font-semibold text-accent hover:underline" href={`/properties/${row.id}`}>{row.name}</a>
                  <div className="mt-1 text-xs text-muted">{row.address || "Keine Adresse hinterlegt"}</div>
                </td>
                <td className="px-4 py-3 text-right font-semibold">{formatAnalysisValue(row, type)}</td>
                <td className="px-4 py-3 text-right text-muted">{money(row.propertyValue)}</td>
                <td className="px-4 py-3 text-right text-muted">{money(row.loanValue)}</td>
                <td className="px-4 py-3 text-right text-muted">{money(row.annualColdRent)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-line bg-panel font-bold">
            <tr>
              <td className="px-4 py-3">Summe / Gesamt</td>
              <td className="px-4 py-3 text-right">{formatTotal(rows, type, total)}</td>
              <td className="px-4 py-3 text-right">{money(rows.reduce((sum, row) => sum + row.propertyValue, 0))}</td>
              <td className="px-4 py-3 text-right">{money(rows.reduce((sum, row) => sum + row.loanValue, 0))}</td>
              <td className="px-4 py-3 text-right">{money(rows.reduce((sum, row) => sum + row.annualColdRent, 0))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function SortableHeader({
  activeDirection,
  activeSort,
  align = "left",
  label,
  sort,
  type
}: {
  activeDirection: SortDirection;
  activeSort: AnalysisSortKey;
  align?: "left" | "right";
  label: string;
  sort: AnalysisSortKey;
  type: AnalysisKey;
}) {
  const isActive = activeSort === sort;
  const nextDirection: SortDirection = isActive && activeDirection === "desc" ? "asc" : "desc";
  const indicator = isActive ? (activeDirection === "desc" ? "↓" : "↑") : "↕";
  const href = `/properties?auswertung=${type}&sort=${sort}&richtung=${nextDirection}`;
  return (
    <th className={`px-4 py-3 ${align === "right" ? "text-right" : ""}`}>
      <a className={`inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-white hover:text-ink ${align === "right" ? "justify-end" : ""}`} href={href}>
        <span>{label}</span>
        <span aria-hidden="true" className={isActive ? "text-accent" : "text-muted/70"}>{indicator}</span>
      </a>
    </th>
  );
}

function compareRows(a: PropertyAnalysisRow, b: PropertyAnalysisRow, type: AnalysisKey, sortKey: AnalysisSortKey, direction: SortDirection) {
  const factor = direction === "asc" ? 1 : -1;
  if (sortKey === "name") {
    const byName = a.name.localeCompare(b.name, "de", { sensitivity: "base" });
    if (byName !== 0) return byName * factor;
    return a.address.localeCompare(b.address, "de", { sensitivity: "base" }) * factor;
  }
  const left = sortableNumericValue(a, type, sortKey);
  const right = sortableNumericValue(b, type, sortKey);
  if (left === right) return a.name.localeCompare(b.name, "de", { sensitivity: "base" });
  return (left - right) * factor;
}

function sortableNumericValue(row: PropertyAnalysisRow, type: AnalysisKey, sortKey: AnalysisSortKey) {
  if (sortKey === "propertyValue") return row.propertyValue;
  if (sortKey === "loanValue") return row.loanValue;
  if (sortKey === "annualColdRent") return row.annualColdRent;
  return numericValue(row, type);
}

function numericValue(row: PropertyAnalysisRow, type: AnalysisKey) {
  if (type === "immobilienwert") return row.propertyValue;
  if (type === "darlehen") return row.loanValue;
  if (type === "nettowert") return row.netValue;
  if (type === "rendite") return row.yieldValue || 0;
  if (type === "gehebelte-rendite") return row.leveragedYield || 0;
  if (type === "kaltmiete") return row.coldMonthly;
  return row.warmMonthly;
}

function totalValue(rows: PropertyAnalysisRow[], type: AnalysisKey) {
  if (type === "rendite") return percent(rows.reduce((sum, row) => sum + row.annualColdRent, 0), rows.reduce((sum, row) => sum + row.propertyValue, 0));
  if (type === "gehebelte-rendite") return percent(rows.reduce((sum, row) => sum + row.annualColdRent, 0), rows.reduce((sum, row) => sum + row.netValue, 0));
  return money(rows.reduce((sum, row) => sum + numericValue(row, type), 0));
}

function formatAnalysisValue(row: PropertyAnalysisRow, type: AnalysisKey) {
  if (type === "rendite") return percent(row.annualColdRent, row.propertyValue);
  if (type === "gehebelte-rendite") return percent(row.annualColdRent, row.netValue);
  return money(numericValue(row, type));
}

function formatTotal(rows: PropertyAnalysisRow[], type: AnalysisKey, total: string) {
  if (type === "kaltmiete" || type === "warmmiete") {
    const monthly = type === "kaltmiete"
      ? rows.reduce((sum, row) => sum + row.coldMonthly, 0)
      : rows.reduce((sum, row) => sum + row.warmMonthly, 0);
    return `${money(monthly)} / Monat`;
  }
  return total;
}

function money(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function percent(numerator: number, denominator: number) {
  if (!denominator || denominator <= 0) return "offen";
  return new Intl.NumberFormat("de-DE", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(numerator / denominator);
}
