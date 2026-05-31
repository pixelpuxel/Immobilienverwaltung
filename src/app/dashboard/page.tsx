import { Role } from "@prisma/client";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { StatCard } from "@/components/StatCard";
import { activityHref, activityLabelMap, activityTitle } from "@/lib/activity-display";
import { requireUser } from "@/lib/auth";
import { brokerPropertyIds, brokerVisibleDocumentWhere, tenantUnitId } from "@/lib/permissions";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const brokerIds = user.role === Role.BROKER ? await brokerPropertyIds(user.id) : null;
  const tenantUnit = user.role === Role.TENANT ? await tenantUnitId(user.id) : null;
  const [properties, units, documents, contracts, auditLogs, propertyValue, loanValue, income] = user.role === Role.ADMIN
    ? await Promise.all([
        prisma.property.count({ where: portalWhere(user) }),
        prisma.unit.count({ where: { property: portalWhere(user) } }),
        prisma.document.count({ where: portalWhere(user) }),
        prisma.leaseContract.count({ where: { unit: { property: portalWhere(user) } } }),
        prisma.auditLog.findMany({ where: portalWhere(user), orderBy: { createdAt: "desc" }, take: 8, include: { user: true } }),
        totalPropertyValue(undefined, user.portalInstanceId),
        totalLoanValue(undefined, user.portalInstanceId),
        totalMonthlyIncome(undefined, user.portalInstanceId)
      ])
    : user.role === Role.BROKER
      ? await Promise.all([
          prisma.property.count({ where: { id: { in: brokerIds || [] } } }),
          prisma.unit.count({ where: { propertyId: { in: brokerIds || [] } } }),
          prisma.document.count({ where: brokerVisibleDocumentWhere(user.id, brokerIds || []) }),
          prisma.leaseContract.count({ where: { unit: { propertyId: { in: brokerIds || [] } } } }),
          [],
          totalPropertyValue(brokerIds || []),
          0,
          totalMonthlyIncome(brokerIds || [])
        ])
      : await Promise.all([
          prisma.property.count({ where: { units: { some: { id: tenantUnit || "" } } } }),
          tenantUnit ? 1 : 0,
          prisma.document.count({ where: { OR: [{ unitId: tenantUnit || "" }, { permissions: { some: { userId: user.id, canView: true } } }] } }),
          prisma.leaseContract.count({ where: { tenantProfile: { userId: user.id } } }),
          [],
          0,
          0,
          { cold: 0, warm: 0 }
        ]);
  const owner = user.role === Role.BROKER ? await prisma.user.findFirst({ where: { role: Role.ADMIN, active: true, ...portalWhere(user) }, orderBy: { createdAt: "asc" } }) : null;
  const ownerMail = owner?.contactEmail || owner?.email || "admin@example.com";
  const annualColdRent = income.cold * 12;
  const netValue = propertyValue - loanValue;
  const activityLabels = user.role === Role.ADMIN ? await activityLabelMap(auditLogs) : new Map<string, string>();
  const propertyBaseHref = user.role === Role.BROKER ? "/broker" : "/properties";

  return (
    <AppShell role={user.role} userId={user.id} email={user.email} canSwitchView={user.role === Role.ADMIN || Boolean(user.impersonatedByAdminId)}>
      <div className="mb-8 overflow-hidden rounded-lg border border-line bg-[radial-gradient(circle_at_top_left,#e6f7ee_0,#ffffff_36%,#eef4ff_100%)] p-6 shadow-sm">
        <div className="max-w-3xl">
          <div className="text-sm font-bold uppercase tracking-wide text-accent">{user.role === Role.ADMIN ? "Eigentümerübersicht" : "Portalübersicht"}</div>
          <h1 className="mt-2 text-3xl font-bold">Dashboard</h1>
          <p className="mt-2 text-muted">{user.role === Role.ADMIN ? "Werte, Einnahmen, Unterlagen und aktuelle Vorgänge auf einen Blick." : "Ihr freigegebener Bereich."}</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {user.role !== Role.TENANT ? (
          <>
            <Link href={user.role === Role.BROKER ? "/broker" : "/properties"}><StatCard label="Immobilien" value={properties} detail="Objekte in Ihrer Ansicht" icon="IM" tone="emerald" /></Link>
            <Link href={user.role === Role.BROKER ? "/broker" : "/properties"}><StatCard label="Einheiten" value={units} detail="Wohn- und Nutzungseinheiten" icon="WE" tone="blue" /></Link>
          </>
        ) : null}
        <Link href="/documents"><StatCard label="Dokumente" value={documents} detail={user.role === Role.TENANT ? "Für Sie bereitgestellt" : "Geschuetzte Unterlagen"} icon="DU" tone="violet" /></Link>
        <Link href="/contracts"><StatCard label="Verträge" value={contracts} detail={user.role === Role.TENANT ? "Ihre Mietvertraege" : "Erzeugte Vertragsdokumente"} icon="MV" tone="amber" /></Link>
        {user.role === Role.ADMIN ? <Link href="/properties?auswertung=immobilienwert"><StatCard label="Immobilienwert" value={money(propertyValue)} detail="Summe der Kaufpreisvorstellungen" icon="€" tone="rose" /></Link> : null}
        {user.role === Role.ADMIN ? <Link href="/properties?auswertung=darlehen"><StatCard label="Valutierte Darlehen" value={money(loanValue)} detail="Noch offene Darlehenssumme" icon="DL" tone="slate" /></Link> : null}
        {user.role === Role.ADMIN ? <Link href="/properties?auswertung=nettowert"><StatCard label="Nettowert" value={money(netValue)} detail="Kaufpreisvorstellung minus Darlehen" icon="NW" tone="blue" /></Link> : null}
        {user.role === Role.ADMIN ? <Link href="/properties?auswertung=rendite"><StatCard label="Rendite" value={percent(annualColdRent, propertyValue)} detail="Jahreskaltmiete geteilt durch Kaufpreisvorstellung" icon="%" tone="emerald" /></Link> : null}
        {user.role === Role.ADMIN ? <Link href="/properties?auswertung=gehebelte-rendite"><StatCard label="Gehebelte Rendite" value={percent(annualColdRent, netValue)} detail="Jahreskaltmiete geteilt durch Nettowert" icon="GR" tone="amber" /></Link> : null}
        {user.role !== Role.TENANT ? <Link href={`${propertyBaseHref}?auswertung=kaltmiete`}><StatCard label="Kaltmiete" value={money(income.cold)} detail={`${money(income.cold * 12)} / Jahr inkl. Tiefgarage, ohne Nebenkosten`} icon="KM" tone="slate" /></Link> : null}
        {user.role !== Role.TENANT ? <Link href={`${propertyBaseHref}?auswertung=warmmiete`}><StatCard label="Warmmiete" value={money(income.warm)} detail={`${money(income.warm * 12)} / Jahr inkl. Nebenkosten`} icon="WM" tone="emerald" /></Link> : null}
      </div>
      {user.role === Role.ADMIN ? (
        <section className="mt-8 overflow-hidden rounded-lg border border-line bg-white shadow-sm">
          <div className="border-b border-line bg-panel p-4">
            <h2 className="text-xl font-bold">Letzte Aktivitäten</h2>
            <p className="mt-1 text-sm text-muted">Was zuletzt im Portal passiert ist.</p>
          </div>
          <div className="divide-y divide-line">
            {auditLogs.map((log) => {
              const href = activityHref(log.entity, log.entityId);
              const detail = activityDetail(log.action, log.detail);
              const title = activityTitle(log.action, log.entity, log.entityId, activityLabels);
              return (
                <div className="grid gap-3 p-4 text-sm md:grid-cols-[56px_minmax(0,1fr)_180px]" key={log.id}>
                  <ActivityIcon action={log.action} />
                  <div>
                    {href ? (
                      <Link className="font-semibold text-accent hover:underline" href={href}>{title}</Link>
                    ) : (
                      <div className="font-semibold">{title}</div>
                    )}
                    {detail ? <div className="mt-1 text-xs text-muted">{detail}</div> : null}
                  </div>
                  <div className="text-muted md:text-right">
                    <div>{log.user?.name || log.user?.email || "System"}</div>
                    <div>{new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(log.createdAt)}</div>
                  </div>
                </div>
              );
            })}
            {!auditLogs.length ? <div className="p-4 text-sm text-muted">Noch keine Aktivitäten.</div> : null}
          </div>
        </section>
      ) : user.role === Role.BROKER ? (
        <section className="mt-8 rounded-lg border border-line p-5">
          <h2 className="text-xl font-bold">Kontakt zum Eigentümer</h2>
          <p className="mt-2 text-muted">Fragen zu Unterlagen, fehlenden Informationen oder Verkaufsunterlagen direkt an die Verwaltung senden.</p>
          {owner ? (
            <div className="mt-3 text-sm text-muted">
              <div>{owner.contactPerson || owner.name || "Eigentümer"}</div>
              {owner.contactPhone ? <div>{owner.contactPhone}</div> : null}
              {owner.contactAddress ? <div>{owner.contactAddress}</div> : null}
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-3">
            <a className="button" href={`mailto:${ownerMail}?subject=Rueckfrage%20Immobilienportal`}>Nachricht senden</a>
            <a className="button-secondary" href={`mailto:${ownerMail}?subject=Unterlagen%20anfordern`}>Unterlagen anfordern</a>
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}

async function totalPropertyValue(propertyIds?: string[], portalInstanceId?: string | null) {
  const properties = await prisma.property.findMany({
    where: { ...(propertyIds ? { id: { in: propertyIds } } : {}), ...(portalInstanceId ? { portalInstanceId } : {}) },
    select: { expectedPurchasePrice: true }
  });
  return properties.reduce((sum, property) => sum + Number(property.expectedPurchasePrice || 0), 0);
}

async function totalLoanValue(propertyIds?: string[], portalInstanceId?: string | null) {
  const properties = await prisma.property.findMany({
    where: { ...(propertyIds ? { id: { in: propertyIds } } : {}), ...(portalInstanceId ? { portalInstanceId } : {}) },
    select: { outstandingLoan: true }
  });
  return properties.reduce((sum, property) => sum + Number(property.outstandingLoan || 0), 0);
}

async function totalMonthlyIncome(propertyIds?: string[], portalInstanceId?: string | null) {
  const units = await prisma.unit.findMany({
    where: { ...(propertyIds ? { propertyId: { in: propertyIds } } : {}), ...(portalInstanceId ? { property: { portalInstanceId } } : {}) },
    select: { rentAmount: true, garageRent: true, serviceCharges: true, warmRent: true }
  });
  return units.reduce((sum, unit) => {
    const rent = Number(unit.rentAmount || 0) + Number(unit.garageRent || 0);
    const charges = Number(unit.serviceCharges || 0);
    return {
      cold: sum.cold + rent,
      warm: sum.warm + rent + charges
    };
  }, { cold: 0, warm: 0 });
}

function money(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function percent(numerator: number, denominator: number) {
  if (!denominator || denominator <= 0) return "offen";
  return new Intl.NumberFormat("de-DE", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(numerator / denominator);
}

function activityDetail(action: string, detail: unknown) {
  const data = isRecord(detail) ? detail : null;
  if (data?.ownerProfileUpdated) return "Eigentümer-Kontaktdaten wurden geaendert.";
  if (data?.deleted) return "Eintrag wurde geloescht.";
  if (data?.brokerValuationUpdated) {
    return typeof data.amount === "number" ? `Makler-Kaufpreisschaetzung: ${money(data.amount)}` : "Makler-Kaufpreisschaetzung wurde geaendert.";
  }
  if (Array.isArray(data?.propertyIds)) return `${data.propertyIds.length} Immobilienfreigaben geaendert.`;
  if (typeof data?.documentId === "string") return `Dokumentrechte geaendert: ansehen ${yesNo(data.canView)}, herunterladen ${yesNo(data.canDownload)}.`;
  if (action === "PERMISSION_CHANGED" && typeof data?.canView !== "undefined") return `Rechte: ansehen ${yesNo(data.canView)}, herunterladen ${yesNo(data.canDownload)}.`;
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function yesNo(value: unknown) {
  return value ? "ja" : "nein";
}

function ActivityIcon({ action }: { action: string }) {
  const styles: Record<string, string> = {
    LOGIN: "bg-sky-100 text-sky-700",
    FILE_UPLOADED: "bg-emerald-100 text-emerald-700",
    FILE_VIEWED: "bg-violet-100 text-violet-700",
    FILE_DOWNLOADED: "bg-blue-100 text-blue-700",
    PERMISSION_CHANGED: "bg-amber-100 text-amber-700",
    CONTRACT_GENERATED: "bg-rose-100 text-rose-700",
    PROPERTY_CHANGED: "bg-teal-100 text-teal-700",
    USER_INVITED: "bg-fuchsia-100 text-fuchsia-700"
  };
  const labels: Record<string, string> = {
    LOGIN: "IN",
    FILE_UPLOADED: "UP",
    FILE_VIEWED: "AN",
    FILE_DOWNLOADED: "DL",
    PERMISSION_CHANGED: "RE",
    CONTRACT_GENERATED: "VG",
    PROPERTY_CHANGED: "IM",
    USER_INVITED: "BN"
  };
  return <div className={`grid h-11 w-11 place-items-center rounded-md text-xs font-black ${styles[action] || "bg-panel text-muted"}`}>{labels[action] || "AK"}</div>;
}
