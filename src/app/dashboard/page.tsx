import { Role } from "@prisma/client";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { StatCard } from "@/components/StatCard";
import { requireUser } from "@/lib/auth";
import { brokerPropertyIds, tenantUnitId } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const brokerIds = user.role === Role.BROKER ? await brokerPropertyIds(user.id) : null;
  const tenantUnit = user.role === Role.TENANT ? await tenantUnitId(user.id) : null;
  const [properties, units, documents, contracts, auditLogs] = user.role === Role.ADMIN
    ? await Promise.all([
        prisma.property.count(),
        prisma.unit.count(),
        prisma.document.count(),
        prisma.leaseContract.count(),
        prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { user: true } })
      ])
    : user.role === Role.BROKER
      ? await Promise.all([
          prisma.property.count({ where: { id: { in: brokerIds || [] } } }),
          prisma.unit.count({ where: { propertyId: { in: brokerIds || [] } } }),
          prisma.document.count({ where: { propertyId: { in: brokerIds || [] }, permissions: { some: { userId: user.id, canView: true } } } }),
          prisma.leaseContract.count({ where: { unit: { propertyId: { in: brokerIds || [] } } } }),
          []
        ])
      : await Promise.all([
          prisma.property.count({ where: { units: { some: { id: tenantUnit || "" } } } }),
          tenantUnit ? 1 : 0,
          prisma.document.count({ where: { OR: [{ unitId: tenantUnit || "" }, { permissions: { some: { userId: user.id, canView: true } } }] } }),
          prisma.leaseContract.count({ where: { tenantProfile: { userId: user.id } } }),
          []
        ]);

  return (
    <AppShell role={user.role} userId={user.id} email={user.email} canSwitchView={user.role === Role.ADMIN || Boolean(user.impersonatedByAdminId)}>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="mt-2 text-muted">{user.role === Role.ADMIN ? "Verwaltung und Kontrolle." : "Ihr freigegebener Bereich."}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <Link href={user.role === Role.BROKER ? "/broker" : user.role === Role.TENANT ? "/tenant" : "/properties"}><StatCard label="Immobilien" value={properties} /></Link>
        <Link href={user.role === Role.BROKER ? "/broker" : user.role === Role.TENANT ? "/tenant" : "/properties"}><StatCard label="Einheiten" value={units} /></Link>
        <Link href="/documents"><StatCard label="Dokumente" value={documents} /></Link>
        <Link href="/contracts"><StatCard label="Vertraege" value={contracts} /></Link>
      </div>
      {user.role === Role.ADMIN ? (
        <section className="mt-8 rounded-lg border border-line">
          <div className="border-b border-line p-4 font-bold">Letzte Audit-Logs</div>
          <div className="divide-y divide-line">
            {auditLogs.map((log) => (
              <div className="grid gap-1 p-4 text-sm md:grid-cols-[180px_minmax(0,1fr)_220px]" key={log.id}>
                <div className="font-semibold">{log.action}</div>
                <div>{log.entity || "System"} {log.entityId || ""}</div>
                <div className="text-muted">{log.user?.email || "System"}</div>
              </div>
            ))}
          </div>
        </section>
      ) : user.role === Role.BROKER ? (
        <section className="mt-8 rounded-lg border border-line p-5">
          <h2 className="text-xl font-bold">Kontakt zum Eigentuemer</h2>
          <p className="mt-2 text-muted">Fragen zu Unterlagen, fehlenden Informationen oder Verkaufsunterlagen direkt an die Verwaltung senden.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a className="button" href="mailto:admin@meinedomain.de?subject=Rueckfrage%20Immobilienportal">Nachricht senden</a>
            <a className="button-secondary" href="mailto:admin@meinedomain.de?subject=Unterlagen%20anfordern">Unterlagen anfordern</a>
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
