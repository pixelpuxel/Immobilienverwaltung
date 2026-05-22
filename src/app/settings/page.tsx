import { Role } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { JsonForm } from "@/components/JsonForm";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser([Role.ADMIN]);
  const categories = await prisma.documentCategory.findMany({ orderBy: [{ group: "asc" }, { name: "asc" }] });
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
          <div className="border-b border-line p-4 font-bold">Dokumentenkategorien</div>
          {categories.map((category) => (
            <div className="grid gap-1 border-b border-line p-4 text-sm md:grid-cols-[160px_minmax(0,1fr)]" key={category.id}>
              <div className="font-semibold">{category.group}</div>
              <div>{category.name}</div>
            </div>
          ))}
        </section>
        <JsonForm endpoint="/api/document-categories" submitLabel="Kategorie anlegen">
          <label>Gruppe<input name="group" required /></label>
          <label>Name<input name="name" required /></label>
          <label>Beschreibung<textarea name="description" /></label>
        </JsonForm>
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
