import { Role } from "@prisma/client";
import { AccountSettingsForm } from "@/components/AccountSettingsForm";
import { AppShell } from "@/components/AppShell";
import { ApiTokenManager } from "@/components/ApiTokenManager";
import { BackupTools } from "@/components/BackupTools";
import { CategoryVisibilityForm } from "@/components/CategoryVisibilityForm";
import { JsonForm } from "@/components/JsonForm";
import { OwnerProfileForm } from "@/components/OwnerProfileForm";
import { PortalInstanceManager } from "@/components/PortalInstanceManager";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser([Role.ADMIN]);
  const [categories, ownerProfile, apiTokens] = await Promise.all([
    prisma.documentCategory.findMany({ orderBy: [{ group: "asc" }, { name: "asc" }] }),
    prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
    prisma.apiToken.findMany({
      where: { user: user.portalInstanceId ? { portalInstanceId: user.portalInstanceId } : {} },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, scopes: true, lastUsedAt: true, expiresAt: true, revokedAt: true, createdAt: true }
    })
  ]);
  return (
    <AppShell role={user.role} userId={user.id} email={user.email} canSwitchView={user.role === Role.ADMIN || Boolean(user.impersonatedByAdminId)}>
      <h1 className="text-3xl font-bold">Einstellungen</h1>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Info label="APP_URL" value={env.appUrl} />
        <Info label="TRUST_PROXY" value={String(env.trustProxy)} />
        <Info label="UPLOAD_PATH" value={env.uploadPath} />
        <Info label="CONTRACTS_PATH" value={env.contractsPath} />
        <Info label="Rate Limit" value={`${env.rateLimitMaxRequests} / ${env.rateLimitWindowSeconds}s`} />
        <Info label="Reverse Proxy" value="Nginx Proxy Manager, Traefik und Caddy kompatibel" />
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_420px]">
        <section className="rounded-lg border border-line">
          <div className="border-b border-line p-4">
            <div className="font-bold">Dokumentenkategorien</div>
            <p className="mt-1 text-sm text-muted">Eigentümer sehen alles. Hier steuerst du, welche Dokumentarten Makler oder Mieter grundsätzlich sehen dürfen.</p>
          </div>
          <div className="hidden border-b border-line bg-panel px-4 py-2 text-xs font-bold uppercase text-muted md:grid md:grid-cols-[150px_minmax(180px,1fr)_290px]">
            <div>Bereich</div>
            <div>Dokumentart</div>
            <div className="text-right">Sichtbar für</div>
          </div>
          {categories.map((category) => (
            <div className="grid gap-3 border-b border-line p-4 text-sm md:grid-cols-[150px_minmax(180px,1fr)_290px] md:items-center" key={category.id}>
              <div className="font-semibold">{category.group}</div>
              <div>{category.name}</div>
              <CategoryVisibilityForm category={category} />
            </div>
          ))}
        </section>
        <div className="grid gap-6">
          <BackupTools />
          <ApiTokenManager initialTokens={apiTokens.map((token) => ({
            ...token,
            createdAt: token.createdAt.toISOString(),
            lastUsedAt: token.lastUsedAt?.toISOString() || null,
            expiresAt: token.expiresAt?.toISOString() || null,
            revokedAt: token.revokedAt?.toISOString() || null
          }))} />
          {user.platformAdmin ? <PortalInstanceManager /> : null}
          <AccountSettingsForm userId={user.id} profile={ownerProfile} />
          <OwnerProfileForm userId={user.id} profile={ownerProfile} />
          <JsonForm endpoint="/api/document-categories" submitLabel="Kategorie anlegen">
            <label>Gruppe<input name="group" required /></label>
            <label>Name<input name="name" required /></label>
            <label>Beschreibung<textarea name="description" /></label>
          </JsonForm>
        </div>
      </div>
    </AppShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-5">
      <div className="text-sm font-semibold text-muted">{label}</div>
      <div className="mt-1 break-all font-mono text-sm">{value}</div>
    </div>
  );
}
