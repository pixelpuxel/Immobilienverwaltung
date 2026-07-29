import { Role } from "@prisma/client";
import Link from "next/link";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
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
  const selectedTenant = selectedUnit?.tenants.find((tenant) => tenant.id === searchParams?.tenantId) || null;
  const config = await getBankingIntegration(user.portalInstanceId);
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
      {data ? <ServiceChargePreview data={data} /> : null}
      {!data && !error && config?.apiTokenEncrypted ? (
        <Notice tone="neutral">Immobilie und Abrechnungsjahr auswaehlen. Es werden noch keine Abrechnungsdaten gespeichert oder versendet.</Notice>
      ) : null}
    </AppShell>
  );
}

function ServiceChargePreview({ data }: { data: ServiceChargeData }) {
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
