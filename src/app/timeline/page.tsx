import Link from "next/link";
import { Role } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/lib/auth";
import { TIMELINE_EVENT_TYPES, listTimelineItems, type TimelineItem } from "@/lib/timeline";

export const dynamic = "force-dynamic";

export default async function TimelinePage() {
  const user = await requireUser();
  const canSwitchView = user.role === Role.ADMIN || Boolean(user.impersonatedByAdminId);
  const items = await listTimelineItems(user, {
    includeInternal: user.role === Role.ADMIN,
    includeDerived: true,
    limit: 200
  });
  const grouped = groupByProperty(items);

  return (
    <AppShell role={user.role} userId={user.id} email={user.email} canSwitchView={canSwitchView}>
      <div className="mb-6 rounded-lg border border-line bg-gradient-to-r from-emerald-50 via-sky-50 to-white p-5">
        <div className="text-xs font-bold uppercase text-accent">Portalweite Chronik</div>
        <h1 className="mt-1 text-3xl font-bold">Timeline</h1>
        <p className="mt-2 max-w-3xl text-muted">
          Automatische Ereignisse aus Mietern, Vertraegen, Kautionen und Mieteinnahmen plus manuell erfasste Vorgaenge.
          Neue Ereignisse legst du direkt in der jeweiligen Immobilie an.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Ereignisse" value={items.length} />
        <Metric label="Manuell" value={items.filter((item) => item.source === "timeline").length} />
        <Metric label="Automatisch" value={items.filter((item) => item.source !== "timeline").length} />
        <Metric label="Offen" value={items.filter((item) => ["OPEN", "OVERDUE", "PARTIAL"].includes(item.status)).length} />
      </section>

      <div className="mt-6 grid gap-4">
        {grouped.length ? grouped.map((group) => (
          <details key={group.key} className="overflow-hidden rounded-lg border border-line bg-white" open={group.key === "__recent__"}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-panel px-4 py-3 [&::-webkit-details-marker]:hidden">
              <div>
                <h2 className="text-lg font-bold">{group.label}</h2>
                <p className="text-sm text-muted">{group.items.length} Ereignisse</p>
              </div>
              {group.propertyId ? <Link className="button-secondary px-3 py-2 text-sm" href={`/properties/${group.propertyId}#timeline`}>Zum Objekt</Link> : null}
            </summary>
            <div className="divide-y divide-line">
              {group.items.map((item) => <TimelineRow key={item.id} item={item} />)}
            </div>
          </details>
        )) : (
          <div className="rounded-lg border border-line bg-panel p-5 text-muted">
            Noch keine Timeline-Ereignisse vorhanden.
          </div>
        )}
      </div>
    </AppShell>
  );
}

function TimelineRow({ item }: { item: TimelineItem }) {
  const tone = TIMELINE_EVENT_TYPES.find((type) => type.value === item.eventType)?.tone || "bg-panel text-muted";
  return (
    <article id={`timeline-${item.id}`} className="grid gap-3 p-4 sm:grid-cols-[130px_minmax(0,1fr)]">
      <div>
        <div className="font-bold">{formatDate(item.eventDate)}</div>
        <div className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs font-bold ${tone}`}>{item.eventTypeLabel}</div>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold">{item.href ? <Link className="text-accent hover:underline" href={item.href}>{item.title}</Link> : item.title}</h3>
          <span className="rounded-full bg-panel px-2 py-1 text-xs font-semibold text-muted">{item.source === "timeline" ? "manuell" : "automatisch"}</span>
        </div>
        {item.description ? <p className="mt-1 text-sm text-muted">{item.description}</p> : null}
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {item.property ? <Link className="rounded-full bg-panel px-2 py-1 text-muted hover:text-accent" href={`/properties/${item.property.id}`}>{item.property.name}</Link> : null}
          {item.unit ? <Link className="rounded-full bg-panel px-2 py-1 text-muted hover:text-accent" href={`/properties/${item.property?.id || ""}#unit-${item.unit.id}`}>Einheit: {item.unit.unitNumber}</Link> : null}
          {item.tenantProfile ? <Link className="rounded-full bg-panel px-2 py-1 text-muted hover:text-accent" href={`/users?tenantId=${item.tenantProfile.id}`}>Mieter: {item.tenantProfile.firstName} {item.tenantProfile.lastName}</Link> : null}
          <span className="rounded-full bg-panel px-2 py-1 text-muted">Status: {item.status}</span>
          {item.costAmount ? <span className="rounded-full bg-panel px-2 py-1 text-muted">{formatCurrency(Number(item.costAmount))}</span> : null}
          {item.isInternal ? <span className="rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-800">intern</span> : null}
        </div>
        {item.documents.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {item.documents.map((document) => (
              <Link key={document.id} className="rounded-md border border-line bg-white px-3 py-2 text-xs font-semibold hover:border-accent" href={`/documents?documentId=${document.id}`}>
                {document.title}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function groupByProperty(items: TimelineItem[]) {
  const groups = new Map<string, { key: string; label: string; propertyId: string | null; items: TimelineItem[] }>();
  for (const item of items) {
    const key = item.property?.id || "__recent__";
    const group = groups.get(key) || {
      key,
      label: item.property?.name || "Ohne Objektbezug",
      propertyId: item.property?.id || null,
      items: []
    };
    group.items.push(item);
    groups.set(key, group);
  }
  return Array.from(groups.values()).sort((left, right) => {
    const latestLeft = new Date(left.items[0]?.eventDate || 0).getTime();
    const latestRight = new Date(right.items[0]?.eventDate || 0).getTime();
    return latestRight - latestLeft;
  });
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <div className="text-2xl font-bold">{value}</div>
      <div className="mt-1 text-sm font-semibold text-muted">{label}</div>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-DE").format(new Date(value));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value || 0);
}
