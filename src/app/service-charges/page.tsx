import { Role } from "@prisma/client";
import Link from "next/link";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { ServiceChargeRuleForm } from "@/components/ServiceChargeRuleForm";
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
  const [config, savedRule, statements] = await Promise.all([
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
      : []
  ]);
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
          <ServiceChargeRuleForm
            propertyId={selectedProperty.id}
            year={year}
            initialMethod={ruleInput.method}
            initialTotal={ruleInput.totalDistributionValue}
            initialNote={savedRule?.note || ""}
            units={selectedProperty.units.map((unit) => ({
              id: unit.id,
              name: unit.unitNumber,
              livingArea: Number(unit.livingArea || 0),
              value: ruleInput.unitValues[unit.id] || 0
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
                sourceReference: line.sourceReference
              }))}
            />
          ) : null}
        </section>
      ) : null}
      {data && ruleInput ? (
        <ServiceChargePreview data={data} rule={ruleInput} />
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
            finalizedAt: statement.finalizedAt?.toISOString() || null
          }))}
        />
      ) : null}
      {!data && !error && config?.apiTokenEncrypted ? (
        <Notice tone="neutral">Immobilie und Abrechnungsjahr auswaehlen. Es werden noch keine Abrechnungsdaten gespeichert oder versendet.</Notice>
      ) : null}
    </AppShell>
  );
}

function ServiceChargePreview({ data, rule }: { data: ServiceChargeData; rule: AllocationRuleInput }) {
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
          <p className="mt-1 text-sm text-muted">Die Werte sind kontierte Ist-Zahlungen. Umlageschluessel werden erst im Portal angewendet.</p>
        </div>
        <div className="divide-y divide-line">
          {data.tenancies.map((tenancy) => (
            <div className="grid gap-2 p-4 text-sm md:grid-cols-[minmax(180px,1fr)_minmax(140px,1fr)_150px]" key={tenancy.external_id}>
              <div><div className="font-bold">{tenancy.display_name}</div><div className="text-muted">{tenancy.move_in_date || tenancy.lease_start_date} bis {tenancy.move_out_date || "laufend"}</div></div>
              <div className="text-muted">Vertragliche NK: {money(Number(tenancy.service_charges || 0))} / Monat</div>
              <div className="font-bold md:text-right">{money(Number(tenancy.actual_service_charge_prepayments || 0))}</div>
            </div>
          ))}
          {!data.tenancies.length ? <div className="p-4 text-sm text-muted">Keine passenden Mietverhaeltnisse.</div> : null}
        </div>
      </section>

      <LineTable title="Umlagefaehige Kosten" lines={data.allocable_costs.items} />
      <LineTable title="Nebenkostenvorauszahlungen" lines={data.service_charge_prepayments.items} />
    </div>
  );
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
    return {
      method: "AREA",
      totalDistributionValue: 60.6,
      unitValues: Object.fromEntries(property.units.map((unit) => [unit.id, Number(unit.livingArea || 0)])),
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

function LineTable({ title, lines }: { title: string; lines: ServiceChargeLine[] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-line bg-white">
      <div className="border-b border-line p-4"><h2 className="text-xl font-bold">{title}</h2></div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-panel text-left"><tr><th className="p-3">Datum</th><th className="p-3">Gegenpartei / Zweck</th><th className="p-3">Zuordnung</th><th className="p-3 text-right">Betrag</th></tr></thead>
          <tbody className="divide-y divide-line">
            {lines.map((line) => (
              <tr key={line.id}>
                <td className="whitespace-nowrap p-3">{line.value_date || line.booking_date}</td>
                <td className="p-3"><div className="font-semibold">{line.applicant_name || "-"}</div><div className="text-muted">{line.memo || line.purpose || "-"}</div></td>
                <td className="p-3 text-muted">{line.tenant_external_id || line.unit_external_id || "Gesamtobjekt"}</td>
                <td className="whitespace-nowrap p-3 text-right font-bold">{money(Number(line.amount || 0))}</td>
              </tr>
            ))}
            {!lines.length ? <tr><td className="p-4 text-muted" colSpan={4}>Keine kontierten Positionen.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-panel p-4"><div className="text-xs font-bold uppercase text-muted">{label}</div><div className="mt-2 text-xl font-bold">{value}</div></div>;
}

function Notice({ children, tone }: { children: ReactNode; tone: "warning" | "error" | "neutral" }) {
  const colors = tone === "error" ? "border-red-200 bg-red-50 text-red-800" : tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-line bg-panel text-muted";
  return <div className={`mt-6 rounded-lg border p-4 text-sm font-semibold ${colors}`}>{children}</div>;
}
