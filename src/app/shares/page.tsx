import { Role } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { PublicShareManager } from "@/components/PublicShareManager";
import { requireUser } from "@/lib/auth";
import { publicShareUrl } from "@/lib/public-shares";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SharesPage() {
  const user = await requireUser([Role.ADMIN]);
  const shares = await prisma.publicShare.findMany({
    where: { portalInstanceId: user.portalInstanceId },
    include: { files: { orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "desc" },
    take: 100
  });
  return (
    <AppShell role={user.role} userId={user.id} email={user.email} canSwitchView={user.role === Role.ADMIN || Boolean(user.impersonatedByAdminId)}>
      <h1 className="text-3xl font-bold">Geschützte Freigaben</h1>
      <p className="mt-2 max-w-3xl text-muted">Für große Dateien an externe Empfänger, z.B. Steuerberater. Die Links funktionieren ohne Login, sind aber lang, zufällig und optional zeitlich begrenzt.</p>
      <div className="mt-6">
        <PublicShareManager initialShares={shares.map((share) => ({
          id: share.id,
          name: share.name,
          description: share.description,
          url: publicShareUrl(share.slug),
          expiresAt: share.expiresAt?.toISOString() || null,
          revokedAt: share.revokedAt?.toISOString() || null,
          createdAt: share.createdAt.toISOString(),
          files: share.files.map((file) => ({
            id: file.id,
            filename: file.filename,
            size: file.size,
            downloadCount: file.downloadCount,
            lastDownloadedAt: file.lastDownloadedAt?.toISOString() || null
          }))
        }))} />
      </div>
    </AppShell>
  );
}
