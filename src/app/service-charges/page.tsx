import { Role } from "@prisma/client";
import Link from "next/link";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { ServiceChargeRuleForm } from "@/components/ServiceChargeRuleForm";
import { ServiceChargeSourceDocuments } from "@/components/ServiceChargeSourceDocuments";
import { ServiceChargeStatementForm } from "@/components/ServiceChargeStatementForm";
import { ServiceChargeStatementVersions } from "@/components/ServiceChargeStatementVersions";
import {
  getBankingIntegration,
  loadServiceChargeData,
  type ServiceChargeData,
  type ServiceChargeLine
} from "@/lib/banking-integration";
import { requireUser } from "@/lib/auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";
import { money } from "@/lib/rent";
import {
  calculateServiceChargeAllocation,
  type AllocationRuleInput,
  type ServiceChargeMethod
} from "@/lib/service-charge-allocation";
import { isServiceChargeStatementSnapshot } from "@/lib/service-charge-statement";

export const dynamic = "force-dynamic";

export default async function ServiceChargesPage({
  searchParams
}: {
  searchParams?: { propertyId?: string; year?: string; unitId?: string; tenantId?: string };
}) {
  const user = await requireUser([Role.ADMIN]);
  const year = Math.min(2100, Math.max(2000, Number(searchParams?.year || new Date().getFullYear() - 1)));
  const properties = await prisma.property.findMany({
    where: portalWhere(user),
    include: {
      units: {
        include: { tenants: { orderBy: [{ isCurrent: "desc" }, { moveInDate: "desc" }] } },
        orderBy: { unitNumber: "asc" }
      }
    },
    orderBy: { name: "asc" }
  });
  const selectedProperty = properties.find((property) => property.id === searchParams?.propertyId) || null;
  const selectedUnit = selectedProperty?.units.find((unit) => unit.id === searchParams?.unitId) || null;
  const selectedTenant = selectedProperty?.units
    .flatMap((unit) => unit.tenants)
    .find((tenant) => tenant.id === searchParams?.tenantId) || null;
  const [config, savedRule, statements, sourceCategoryCandidates, sourceDocuments] = await Promise.all([
    getBankingIntegration(user.portalInstanceId),
    selectedProperty
      ? prisma.serviceChargeRule.findFirst({
          where: { propertyId: selectedProperty.id, year, property: portalWhere(user) },
          include: { unitAllocations: true, statementLines: { orderBy: { createdAt: "asc" } } }
        })
      : null,
    selectedProperty
      ? prisma.serviceChargeStatement.findMany({
          where: { propertyId: selectedProperty.id, year, deletedAt: null, property: portalWhere(user) },
          orderBy: { version: "desc" }
        })
      : [],
    prisma.documentCategory.findMany({
      where: {
        name: "Hausgeldabrechnungen",
        OR: [
          { portalInstanceId: user.portalInstanceId },
          { portalInstanceId: null }
        ]
      },
      select: { id: true, portalInstanceId: true }
    }),
    selectedProperty
      ? prisma.document.findMany({
          where: {
            propertyId: selectedProperty.id,
            ...portalWhere(user),
            category: { name: "Hausgeldabrechnungen" },
            OR: [
              { documentYear: year },
              { documentYear: null, title: { contains: String(year), mode: "insensitive" } },
              { documentYear: null, filename: { contains: String(year), mode: "insensitive" } }
            ]
          },
          select: {
            id: true,
            title: true,
            filename: true,
            mimeType: true,
            storagePath: true,
            createdAt: true
          },
          orderBy: { createdAt: "desc" }
        })
      : []
  ]);
  const sourceCategory = sourceCategoryCandidates.find((category) => category.portalInstanceId === user.portalInstanceId)
    || sourceCategoryCandidates.find((category) => category.portalInstanceId === null)
    || null;
  const ruleInput = selectedProperty
    ? serviceChargeRuleInput(selectedProperty, savedRule)
    : null;
  let data: ServiceChargeData | null = null;
  let error = "";
  if (selectedProperty && config?.apiTokenEncrypted) {
    try {
      data = await loadServiceChargeData({
        portalInstanceId: user.portalInstanceId,
        propertyId: selectedProperty.id,
        year,
        unitId: selectedUnit?.id,
        tenantId: selectedTenant?.id
      });
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "Banking-Daten konnten nicht geladen werden.";
    }
  }

  return (
    <AppShell role={user.role} userId={user.id} email={user.email} canSwitchView={user.role === Role.ADMIN || Boolean(user.impersonatedByAdminId)}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Nebenkostenabrechnung</h1>
          <p className="mt-2 text-muted">Kontierte Ist-Zahlungen aus Banking pruefen und anschliessend nach den Vertragsdaten verteilen.</p>
        </div>
        <Link className="button button-secondary" href="/settings">Banking-Verbindung</Link>
      </div>

      <form className="mt-6 grid gap-3 rounded-lg border border-line bg-panel p-4 md:grid-cols-[minmax(220px,1fr)_120px_minmax(180px,1fr)_minmax(180px,1fr)_auto] md:items-end">
        <label className="grid gap-1 text-sm font-semibold">
          Immobilie
          <select name="propertyId" defaultValue={selectedProperty?.id || ""} required>
            <option value="">Bitte waehlen</option>
            {properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Jahr
          <input name="year" type="number" min="2000" max="2100" defaultValue={year} />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Einheit
          <select name="unitId" defaultValue={selectedUnit?.id || ""}>
            <option value="">Alle Einheiten</option>
            {selectedProperty?.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.unitNumber}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Mietverhaeltnis
          <select name="tenantId" defaultValue={selectedTenant?.id || ""}>
            <option value="">Alle Mietverhaeltnisse</option>
            {selectedProperty?.units.flatMap((unit) => unit.tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>{tenant.firstName} {tenant.lastName} · {unit.unitNumber}</option>
            )))}
          </select>
        </label>
        <button type="submit">Ist-Daten laden</button>
      </form>

      {!config?.apiTokenEncrypted ? (
        <Notice tone="warning">In den Einstellungen fehlt noch ein Banking-API-Token.</Notice>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {selectedProperty && ruleInput ? (
        <section className="mt-6 rounded-lg border border-line bg-white p-5">
          <div className="mb-4">
            <div className="text-sm font-bold uppercase text-accent">Verteilerschluessel {year}</div>
            <h2 className="mt-1 text-xl font-bold">{selectedProperty.name}</h2>
          </div>
          <ServiceChargeSourceDocuments
            propertyId={selectedProperty.id}
            year={year}
            categoryId={sourceCategory?.id || null}
            documents={sourceDocuments.map((document) => ({
              id: document.id,
              title: document.title,
              filename: document.filename,
              mimeType: document.mimeType,
              hasFile: Boolean(document.storagePath),
              createdAt: document.createdAt.toISOString()
            }))}
          />
          <ServiceChargeRuleForm
            key={`${selectedProperty.id}-${year}-${savedRule?.updatedAt.toISOString() || "new"}`}
            propertyId={selectedProperty.id}
            year={year}
            initialMethod={ruleInput.method}
            initialTotal={ruleInput.totalDistributionValue}
            initialNote={savedRule?.note || ""}
            units={selectedProperty.units.map((unit) => ({
              id: unit.id,
              name: unit.unitNumber,
              livingArea: Number(unit.livingArea || 0),
              value: ruleInput.unitValues[unit.id] ?? 0
            }))}
          />
          {ruleInput.method === "EXTERNAL_STATEMENT" && savedRule ? (
            <ServiceChargeStatementForm
              propertyId={selectedProperty.id}
              year={year}
              units={selectedProperty.units.map((unit) => ({ id: unit.id, name: unit.unitNumber }))}
              lines={savedRule.statementLines.map((line) => ({
                id: line.id,
                unitId: line.unitId,
                description: line.description,
                amount: Number(line.amount),
                treatment: line.treatment,
                sourceReference: line.sourceReference,
                note: line.note
              }))}
            />
          ) : null}
        </section>
      ) : null}
      {data && ruleInput ? (
        <ServiceChargePreview
          data={data}
          rule={ruleInput}
          bankingBaseUrl={config?.baseUrl || "https://banking.schreiber.info"}
        />
      ) : null}
      {selectedProperty && savedRule ? (
        <ServiceChargeStatementVersions
          propertyId={selectedProperty.id}
          year={year}
          statements={statements.map((statement) => ({
            id: statement.id,
            version: statement.version,
            status: statement.status,
            checksum: statement.checksum,
            createdAt: statement.createdAt.toISOString(),
            finalizedAt: statement.finalizedAt?.toISOString() || null,
            tenants: isServiceChargeStatementSnapshot(statement.snapshot)
              ? statement.snapshot.allocation.tenantResults.map((tenant) => ({ id: tenant.tenantId, name: tenant.tenantName }))
              : []
          }))}
        />
      ) : null}
      {!data && !error && config?.apiTokenEncrypted ? (
        <Notice tone="neutral">Immobilie und Abrechnungsjahr auswaehlen. Es werden noch keine Abrechnungsdaten gespeichert oder versendet.</Notice>
      ) : null}
    </AppShell>
  );
}

function ServiceChargePreview({
  data,
  rule,
  bankingBaseUrl
}: {
  data: ServiceChargeData;
  rule: AllocationRuleInput;
  bankingBaseUrl: string;
}) {
  const allocation = calculateServiceChargeAllocation(data, rule);
  return (
    <div className="mt-6 grid gap-6">
      <section className="rounded-lg border border-line bg-white p-5">
        <div className="text-sm font-bold uppercase text-accent">Datenstand {data.year}</div>
        <h2 className="mt-1 text-2xl font-bold">{data.property.name}</h2>
        <p className="mt-1 text-muted">{data.property.address}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Umlagefaehige Ist-Kosten" value={money(Number(data.allocable_costs.total || 0))} />
          <Metric label="Ist-Vorauszahlungen" value={money(Number(data.service_charge_prepayments.total || 0))} />
          <Metric label="Abrechnungszahlungen" value={money(Number(data.service_charge_settlements.total || 0))} />
          <Metric label="Kaltmietanteile" value={money(Number(data.cold_rent.total || 0))} />
        </div>
      </section>

      <section className="rounded-lg border border-line bg-white p-5">
        <div className="text-sm font-bold uppercase text-accent">Berechnete Verteilung</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Kosten gesamt" value={money(allocation.allocableCosts)} />
          <Metric label="Mietern zugeordnet" value={money(allocation.allocatedToTenants)} />
          <Metric label="Eigentuemer / Leerstand" value={money(allocation.ownerShare)} />
          <Metric label="Ist-Vorauszahlungen" value={money(allocation.totalPrepayments)} />
        </div>
        {allocation.warnings.map((warning) => (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" key={warning}>{warning}</div>
        ))}
        {allocation.blockingWarnings.map((warning) => (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-900" key={warning}>{warning}</div>
        ))}
        {allocation.tenantResults.length ? (
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-panel text-left"><tr><th className="p-3">Mietverhaeltnis</th><th className="p-3 text-right">Tage</th><th className="p-3 text-right">Anteil</th><th className="p-3 text-right">Kosten</th><th className="p-3 text-right">Vorauszahlung</th><th className="p-3 text-right">Ergebnis</th></tr></thead>
              <tbody className="divide-y divide-line">
                {allocation.tenantResults.map((item) => (
                  <tr key={item.tenantId}>
                    <td className="p-3 font-semibold">{item.tenantName}</td>
                    <td className="p-3 text-right">{item.occupiedDays} / {item.yearDays}</td>
                    <td className="p-3 text-right">{(item.share * 100).toLocaleString("de-DE", { maximumFractionDigits: 3 })} %</td>
                    <td className="p-3 text-right">{money(item.allocatedCosts)}</td>
                    <td className="p-3 text-right">{money(item.actualPrepayments)}</td>
                    <td className={`p-3 text-right font-bold ${item.result > 0 ? "text-red-700" : "text-emerald-700"}`}>{money(item.result)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-lg border border-line bg-white">
        <div className="border-b border-line p-4">
          <h2 className="text-xl font-bold">Mietverhaeltnisse und Vorauszahlungen</h2>
          <p className="mt-1 text-sm text-muted">Abrechnungsrelevante Mietverhaeltnisse fuer {data.year}. Die Werte sind kontierte Ist-Zahlungen.</p>
        </div>
        <div className="divide-y divide-line">
          {relevantTenancies(data).map((tenancy) => (
            <TenancyRow data={data} key={tenancy.external_id} tenancy={tenancy} />
          ))}
          {!relevantTenancies(data).length ? <div className="p-4 text-sm text-muted">Keine Mietverhaeltnisse im gewaehlten Abrechnungsjahr.</div> : null}
        </div>
        {historicalTenancies(data).length ? (
          <details className="border-t border-line">
            <summary className="cursor-pointer p-4 text-sm font-semibold text-muted">
              Fruehere, fuer {data.year} nicht relevante Mietverhaeltnisse ({historicalTenancies(data).length})
            </summary>
            <div className="divide-y divide-line border-t border-line bg-panel/50">
              {historicalTenancies(data).map((tenancy) => (
                <TenancyRow data={data} historical key={tenancy.external_id} tenancy={tenancy} />
              ))}
            </div>
          </details>
        ) : null}
      </section>

      <LineTable title="Umlagefaehige Kosten" lines={data.allocable_costs.items} bankingBaseUrl={bankingBaseUrl} />
      <LineTable title="Nebenkostenvorauszahlungen" lines={data.service_charge_prepayments.items} bankingBaseUrl={bankingBaseUrl} />
    </div>
  );
}

function TenancyRow({
  data,
  tenancy,
  historical = false
}: {
  data: ServiceChargeData;
  tenancy: ServiceChargeData["tenancies"][number];
  historical?: boolean;
}) {
  const unit = data.units.find((item) => item.external_id === tenancy.unit_external_id);
  return (
    <div className={`grid gap-3 p-4 text-sm md:grid-cols-[minmax(220px,1fr)_minmax(180px,0.8fr)_150px_auto] md:items-center ${historical ? "opacity-75" : ""}`}>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold">{tenancy.display_name}</span>
          {!historical ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">Im Abrechnungsjahr relevant</span> : null}
        </div>
        <div className="mt-1 text-muted">
          {unit?.name || "Einheit ohne Bezeichnung"} · {formatDate(tenancy.move_in_date || tenancy.lease_start_date)} bis {tenancy.move_out_date ? formatDate(tenancy.move_out_date) : "laufend"}
        </div>
      </div>
      <div className="text-muted">
        <div>Vertragliche Kaltmiete: {money(Number(tenancy.rent_amount || 0))} / Monat</div>
        <div>Vertragliche NK: {money(Number(tenancy.service_charges || 0))} / Monat</div>
      </div>
      <div>
        <div className="text-xs font-bold uppercase text-muted">Ist-Vorauszahlungen</div>
        <div className="font-bold md:text-right">{money(Number(tenancy.actual_service_charge_prepayments || 0))}</div>
      </div>
      <Link className="button button-secondary text-center" href={`/users?tenantId=${encodeURIComponent(tenancy.external_id)}`}>
        Mietverhaeltnis bearbeiten
      </Link>
    </div>
  );
}

function tenancyOverlapsYear(tenancy: ServiceChargeData["tenancies"][number], year: number) {
  const start = (tenancy.move_in_date || tenancy.lease_start_date || "").slice(0, 10);
  const end = (tenancy.move_out_date || "").slice(0, 10);
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  return (!start || start <= yearEnd) && (!end || end >= yearStart);
}

function relevantTenancies(data: ServiceChargeData) {
  return data.tenancies
    .filter((tenancy) => tenancyOverlapsYear(tenancy, data.year))
    .sort((left, right) => {
      const leftOpen = left.move_out_date ? 1 : 0;
      const rightOpen = right.move_out_date ? 1 : 0;
      return leftOpen - rightOpen || left.display_name.localeCompare(right.display_name, "de");
    });
}

function historicalTenancies(data: ServiceChargeData) {
  return data.tenancies
    .filter((tenancy) => !tenancyOverlapsYear(tenancy, data.year))
    .sort((left, right) => (right.move_out_date || "").localeCompare(left.move_out_date || ""));
}

function serviceChargeRuleInput(
  property: {
    name: string;
    units: Array<{ id: string; livingArea: { toString(): string } | number | string | null }>;
  },
  savedRule: {
    method: string;
    totalDistributionValue: { toString(): string } | number | string | null;
    unitAllocations: Array<{ unitId: string; value: { toString(): string } | number | string }>;
    statementLines: Array<{
      unitId: string | null;
      amount: { toString(): string } | number | string;
      treatment: string;
    }>;
  } | null
): AllocationRuleInput {
  if (savedRule) {
    return {
      method: savedRule.method as ServiceChargeMethod,
      totalDistributionValue: savedRule.totalDistributionValue === null ? null : Number(savedRule.totalDistributionValue),
      unitValues: Object.fromEntries(savedRule.unitAllocations.map((item) => [item.unitId, Number(item.value)])),
      statementLines: savedRule.statementLines.map((line) => ({
        unitId: line.unitId,
        amount: Number(line.amount),
        treatment: line.treatment as "ALLOCABLE" | "NON_ALLOCABLE" | "RESERVE"
      }))
    };
  }
  const normalizedName = property.name.toLocaleLowerCase("de-DE");
  if (normalizedName.includes("tirol")) {
    const unitValues = Object.fromEntries(property.units.map((unit) => [unit.id, Number(unit.livingArea || 0)]));
    return {
      method: "AREA",
      totalDistributionValue: Object.values(unitValues).reduce((total, value) => total + value, 0),
      unitValues,
      statementLines: []
    };
  }
  if (normalizedName.includes("mainau")) {
    const perUnit = property.units.length ? 100 / property.units.length : 0;
    return {
      method: "FIXED_SHARE",
      totalDistributionValue: 100,
      unitValues: Object.fromEntries(property.units.map((unit) => [unit.id, perUnit])),
      statementLines: []
    };
  }
  return {
    method: "EXTERNAL_STATEMENT",
    totalDistributionValue: null,
    unitValues: {},
    statementLines: []
  };
}

function LineTable({
  title,
  lines,
  bankingBaseUrl
}: {
  title: string;
  lines: ServiceChargeLine[];
  bankingBaseUrl: string;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-line bg-white">
      <div className="border-b border-line p-4"><h2 className="text-xl font-bold">{title}</h2></div>
      <div className="divide-y divide-line">
        {lines.map((line) => (
          <details className="group" key={line.id}>
            <summary className="grid cursor-pointer list-none gap-2 p-4 text-sm hover:bg-panel md:grid-cols-[110px_minmax(220px,1fr)_minmax(150px,0.7fr)_140px_120px] md:items-center">
              <div className="whitespace-nowrap">{formatDate(line.value_date || line.booking_date)}</div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{line.applicant_name || "-"}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${line.bank_imported ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                    {line.bank_imported ? "Bankimport" : "Manuell / Import"}
                  </span>
                </div>
                <div className="line-clamp-2 text-muted">{line.memo || line.purpose || "-"}</div>
              </div>
              <div className="text-muted">{line.tenant_external_id || line.unit_external_id || "Gesamtobjekt"}</div>
              <div>
                <div className="text-xs font-bold uppercase text-muted">Kaltmiete</div>
                <div className="font-semibold">
                  {line.contractual_cold_rent === "" ? "-" : `${money(Number(line.contractual_cold_rent))} / Monat`}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 md:justify-end">
                <span className="font-bold">{money(Number(line.amount || 0))}</span>
                <span aria-hidden="true" className="text-lg text-muted transition group-open:rotate-180">⌄</span>
              </div>
            </summary>
            <div className="border-t border-line bg-panel/60 p-4">
              <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                <Detail label="Buchungsdatum" value={formatDate(line.booking_date)} />
                <Detail label="Wertstellung" value={formatDate(line.value_date)} />
                <Detail label="Gesamtbuchung" value={money(Number(line.transaction_amount || line.amount || 0))} />
                <Detail label="Kontierter Anteil" value={money(Number(line.amount || 0))} />
                <Detail label="Bank / Konto" value={[line.bank_name, line.account_name].filter(Boolean).join(" · ")} />
                <Detail label="Konto-IBAN" value={line.account_iban} />
                <Detail label="Gegenpartei" value={line.applicant_name} />
                <Detail label="Gegenpartei-IBAN" value={line.applicant_iban} />
                <Detail label="Verwendungszweck" value={line.purpose} wide />
                <Detail label="Split-Notiz" value={line.memo} />
                <Detail label="Buchungsreferenz" value={line.bank_reference} />
                <Detail label="Kundenreferenz" value={line.customer_reference} />
                <Detail label="Kategorie" value={line.category_path} />
                <Detail label="Buchungscode" value={line.transaction_code} />
                <Detail label="Quelle" value={line.source_type} />
                <Detail label="Herkunftsschutz" value={line.bank_imported ? "Direkt von der Bank importiert · besonders geschuetzt" : "Manuell oder aus Datei importiert"} />
                <Detail label="Status" value={line.pending ? "Vorgemerkt" : "Gebucht"} />
                <Detail label="Vertragliche Kaltmiete" value={line.contractual_cold_rent === "" ? "" : `${money(Number(line.contractual_cold_rent))} / Monat`} />
                <Detail label="Garage" value={line.contractual_garage_rent === "" ? "" : `${money(Number(line.contractual_garage_rent))} / Monat`} />
              </div>
              <div className="mt-4">
                <Link
                  className="button button-secondary"
                  href={`${bankingBaseUrl.replace(/\/+$/, "")}/transactions/${line.transaction_id}/edit`}
                  target="_blank"
                >
                  Vollstaendige Buchung in Banking oeffnen
                </Link>
              </div>
            </div>
          </details>
        ))}
        {!lines.length ? <div className="p-4 text-sm text-muted">Keine kontierten Positionen.</div> : null}
      </div>
    </section>
  );
}

function Detail({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2 xl:col-span-4" : ""}>
      <div className="text-xs font-bold uppercase text-muted">{label}</div>
      <div className="mt-1 break-words font-medium">{value || "-"}</div>
    </div>
  );
}

function formatDate(value: string) {
  if (!value) return "-";
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("de-DE");
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-panel p-4"><div className="text-xs font-bold uppercase text-muted">{label}</div><div className="mt-2 text-xl font-bold">{value}</div></div>;
}

function Notice({ children, tone }: { children: ReactNode; tone: "warning" | "error" | "neutral" }) {
  const colors = tone === "error" ? "border-red-200 bg-red-50 text-red-800" : tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-line bg-panel text-muted";
  return <div className={`mt-6 rounded-lg border p-4 text-sm font-semibold ${colors}`}>{children}</div>;
}
