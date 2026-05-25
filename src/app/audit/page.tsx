import { Role } from "@prisma/client";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { activityHref, activityLabelMap, activityTitle } from "@/lib/activity-display";
import { requireUser } from "@/lib/auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const user = await requireUser([Role.ADMIN]);
  const logs = await prisma.auditLog.findMany({ where: portalWhere(user), include: { user: true }, orderBy: { createdAt: "desc" }, take: 300 });
  const labels = await activityLabelMap(logs);
  return (
    <AppShell role={user.role} userId={user.id} email={user.email} canSwitchView={user.role === Role.ADMIN || Boolean(user.impersonatedByAdminId)}>
      <h1 className="text-3xl font-bold">Aktivitäten</h1>
      <div className="mt-6 overflow-hidden rounded-lg border border-line">
        {logs.map((log) => {
          const href = activityHref(log.entity, log.entityId);
          const title = activityTitle(log.action, log.entity, log.entityId, labels);
          return (
          <div className="grid gap-2 border-b border-line p-4 text-sm md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px]" key={log.id}>
            <div className="font-semibold">{href ? <Link className="text-accent hover:underline" href={href}>{title}</Link> : title}</div>
            <div className="text-muted">{log.user?.email || "System"} · {log.ipAddress || "ohne IP"}</div>
            <div>{new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(log.createdAt)}</div>
          </div>
        );})}
      </div>
    </AppShell>
  );
}
