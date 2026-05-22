import { Role } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const user = await requireUser([Role.ADMIN]);
  const logs = await prisma.auditLog.findMany({ include: { user: true }, orderBy: { createdAt: "desc" }, take: 300 });
  return (
    <AppShell role={user.role} userId={user.id} email={user.email} canSwitchView={user.role === Role.ADMIN || Boolean(user.impersonatedByAdminId)}>
      <h1 className="text-3xl font-bold">Audit-Logs</h1>
      <div className="mt-6 overflow-hidden rounded-lg border border-line">
        {logs.map((log) => (
          <div className="grid gap-2 border-b border-line p-4 text-sm md:grid-cols-[180px_180px_minmax(0,1fr)_180px]" key={log.id}>
            <div className="font-semibold">{log.action}</div>
            <div>{log.entity || "System"}</div>
            <div className="text-muted">{log.user?.email || "System"} · {log.ipAddress || "ohne IP"}</div>
            <div>{new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(log.createdAt)}</div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
