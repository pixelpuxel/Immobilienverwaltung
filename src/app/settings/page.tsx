import { Role } from "@prisma/client";
import type { ReactNode } from "react";
import { AccountSettingsForm } from "@/components/AccountSettingsForm";
import { AiProviderSettings } from "@/components/AiProviderSettings";
import { AgentSettings } from "@/components/AgentSettings";
import { AgentRegressionTests } from "@/components/AgentRegressionTests";
import { AgentToolOverview } from "@/components/AgentToolOverview";
import { AppShell } from "@/components/AppShell";
import { ApiTokenManager } from "@/components/ApiTokenManager";
import { BackupTools } from "@/components/BackupTools";
import { CategoryVisibilityForm } from "@/components/CategoryVisibilityForm";
import { JsonForm } from "@/components/JsonForm";
import { MailSettingsCard } from "@/components/MailSettingsCard";
import { MailTemplateManager } from "@/components/MailTemplateManager";
import { OwnerProfileForm } from "@/components/OwnerProfileForm";
import { PortalInstanceManager } from "@/components/PortalInstanceManager";
import { TelegramBotSettings } from "@/components/TelegramBotSettings";
import { TenantMailBroadcast } from "@/components/TenantMailBroadcast";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { DEFAULT_AGENT_SYSTEM_PROMPT, ensureAgentConfig } from "@/lib/agent";
import { readAgentRegressionTests } from "@/lib/agent-regression-tests";
import { agentToolCatalogForUi } from "@/lib/agent-tools";
import { ensureMailTemplates, mailTemplatePreviewContext, renderMailTemplate } from "@/lib/mail-templates";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser([Role.ADMIN]);
  await ensureMailTemplates(user.portalInstanceId);
  const agentTools = agentToolCatalogForUi(user.role);
  const [rawCategories, ownerProfile, apiTokens, mailTemplates, tenantMailRecipients, telegramConfig, aiConfig, agentConfig, agentRegressionTests] = await Promise.all([
    prisma.documentCategory.findMany({
      where: { OR: [{ portalInstanceId: user.portalInstanceId }, { portalInstanceId: null }] },
      orderBy: [{ group: "asc" }, { name: "asc" }]
    }),
    prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
    prisma.apiToken.findMany({
      where: { user: user.portalInstanceId ? { portalInstanceId: user.portalInstanceId } : {} },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, scopes: true, lastUsedAt: true, expiresAt: true, revokedAt: true, createdAt: true }
    }),
    prisma.mailTemplate.findMany({
      where: { portalInstanceId: user.portalInstanceId ?? null },
      orderBy: [{ name: "asc" }],
      select: { id: true, key: true, name: true, description: true, trigger: true, subject: true, text: true, placeholders: true, active: true }
    }),
    prisma.user.findMany({
      where: { role: Role.TENANT, active: true, ...portalWhereForSettings(user.portalInstanceId) },
      include: { tenantProfile: { include: { unit: { include: { property: true } } } } },
      orderBy: [{ name: "asc" }, { email: "asc" }]
    }),
    prisma.telegramBotConfig.findFirst({
      where: { portalInstanceId: user.portalInstanceId ?? null },
      select: {
        botUsername: true,
        chatId: true,
        chatTitle: true,
        threadId: true,
        threadTitle: true,
        pendingChatId: true,
        pendingChatTitle: true,
        pendingThreadId: true,
        pendingThreadTitle: true,
        pendingFrom: true,
        pendingText: true,
        pendingAt: true,
        webhookEnabled: true
      }
    }),
    prisma.aiProviderConfig.findFirst({
      where: { portalInstanceId: user.portalInstanceId ?? null },
      select: { provider: true, embeddingModel: true, transcriptionModel: true, apiKeyEncrypted: true }
    }),
    ensureAgentConfig(user.portalInstanceId ?? null),
    readAgentRegressionTests()
  ]);
  const categories = dedupeCategories(rawCategories, user.portalInstanceId);
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
      <div className="mt-8 grid items-start gap-6 xl:grid-cols-2">
        <details className="overflow-hidden rounded-lg border border-line bg-white shadow-sm" open>
          <summary className="cursor-pointer list-none bg-[linear-gradient(135deg,#f7fcf8,#eef4ff)] p-4 [&::-webkit-details-marker]:hidden">
            <div className="inline-flex items-center gap-3">
              <span className="rounded bg-accent px-2 py-1 text-sm font-bold text-white">›</span>
              <span>
                <span className="block font-bold">Dokumentenkategorien</span>
                <span className="mt-1 block text-sm font-normal text-muted">Eigentümer sehen alles. Hier steuerst du, welche Dokumentarten Makler oder Mieter grundsätzlich sehen dürfen.</span>
              </span>
            </div>
          </summary>
          <div className="hidden border-t border-b border-line bg-panel px-4 py-2 text-xs font-bold uppercase text-muted md:grid md:grid-cols-[130px_minmax(220px,1fr)_minmax(260px,auto)]">
            <div>Bereich</div>
            <div>Dokumentart</div>
            <div className="text-right">Sichtbar für</div>
          </div>
          <div>
            {categories.map((category) => (
              <div className="grid gap-3 border-b border-line p-4 text-sm last:border-b-0 md:grid-cols-[130px_minmax(220px,1fr)_minmax(260px,auto)] md:items-center" key={category.id}>
                <div className="font-semibold">{category.group}</div>
                <div>{category.name}</div>
                <CategoryVisibilityForm category={category} />
              </div>
            ))}
          </div>
        </details>
        <div className="grid content-start gap-6">
          <SettingsFold title="Backup und Import" description="Daten exportieren, sichern und wiederherstellen." open>
            <BackupTools />
          </SettingsFold>
          <SettingsFold title="Mailversand" description="SMTP/Postfix-Konfiguration und Testmail." open>
            <MailSettingsCard
              configured={Boolean(env.smtpHost && env.smtpFrom)}
              smtpHost={env.smtpHost}
              smtpPort={env.smtpPort}
              smtpFrom={env.smtpFrom}
              defaultTo={ownerProfile.contactEmail || ownerProfile.email}
            />
          </SettingsFold>
          <SettingsFold title="Mail-Rundschreiben" description="Vorlage auswaehlen und an selektierte oder alle Mieter senden.">
            <TenantMailBroadcast
              recipients={tenantMailRecipients.map((recipient) => ({
                id: recipient.id,
                name: recipient.name || [recipient.tenantProfile?.firstName, recipient.tenantProfile?.lastName].filter(Boolean).join(" ") || recipient.email,
                email: recipient.email,
                unitLabel: recipient.tenantProfile?.unit ? `${recipient.tenantProfile.unit.property.name} / ${recipient.tenantProfile.unit.unitNumber}` : "Keine Einheit"
              }))}
              templates={mailTemplates.map((template) => ({
                id: template.id,
                name: template.name,
                subject: template.subject,
                text: template.text,
                placeholders: template.placeholders
              }))}
            />
          </SettingsFold>
          <SettingsFold title="KI-Anbieter" description="Provider, API-Key, Embeddings und Transkription.">
            <AiProviderSettings initialConfig={aiConfig ? {
              configured: Boolean(aiConfig.apiKeyEncrypted),
              provider: aiConfig.provider,
              embeddingModel: aiConfig.embeddingModel,
              transcriptionModel: aiConfig.transcriptionModel
            } : {
              configured: false,
              provider: "openai",
              embeddingModel: "text-embedding-3-small",
              transcriptionModel: "gpt-4o-mini-transcribe"
            }} />
          </SettingsFold>
          <SettingsFold title="Portal-Agent" description="System-Prompt und Aktivierung für Web und Telegram." open>
            <AgentSettings initialPrompt={agentConfig?.systemPrompt || DEFAULT_AGENT_SYSTEM_PROMPT} initialEnabled={agentConfig?.enabled ?? true} />
          </SettingsFold>
          <SettingsFold title="Agent-Tools" description="Fähigkeiten, Grenzen und Beispielanfragen des Agenten." open>
            <AgentToolOverview tools={agentTools} />
          </SettingsFold>
          <SettingsFold title="Agent-Debugging und Testabfragen" description="Regressionstests, fehlgeschlagene Agent-Anfragen und Bewertungen pflegen.">
            <AgentRegressionTests initialData={agentRegressionTests} />
          </SettingsFold>
          <SettingsFold title="Telegram-Bot" description="Bot, Chat, Thread und Verbindung übernehmen.">
            <TelegramBotSettings initialConfig={telegramConfig ? {
              configured: true,
              ...telegramConfig,
              pendingAt: telegramConfig.pendingAt?.toISOString() || null
            } : { configured: false }} />
          </SettingsFold>
          <SettingsFold title="API-Zugänge" description="Tokens für n8n und andere Integrationen verwalten.">
            <ApiTokenManager initialTokens={apiTokens.map((token) => ({
              ...token,
              createdAt: token.createdAt.toISOString(),
              lastUsedAt: token.lastUsedAt?.toISOString() || null,
              expiresAt: token.expiresAt?.toISOString() || null,
              revokedAt: token.revokedAt?.toISOString() || null
            }))} />
          </SettingsFold>
          {user.platformAdmin ? (
            <SettingsFold title="Portal-Instanzen" description="Instanzen für weitere Nutzer verwalten.">
              <PortalInstanceManager />
            </SettingsFold>
          ) : null}
          <SettingsFold title="Login und Konto" description="E-Mail, Benutzername und Passwort verwalten.">
            <AccountSettingsForm userId={user.id} profile={ownerProfile} />
          </SettingsFold>
          <SettingsFold title="Eigentümerdaten" description="Kontakt-, Bank- und Vertragsdaten des Eigentümers.">
            <OwnerProfileForm userId={user.id} profile={ownerProfile} />
          </SettingsFold>
          <SettingsFold title="Neue Dokumentenkategorie" description="Weitere Dokumentart für Berechtigungen und Uploads anlegen.">
            <JsonForm endpoint="/api/document-categories" submitLabel="Kategorie anlegen">
              <label>Gruppe<input name="group" required /></label>
              <label>Name<input name="name" required /></label>
              <label>Beschreibung<textarea name="description" /></label>
            </JsonForm>
          </SettingsFold>
        </div>
      </div>
      <SettingsFold className="mt-8" title="Mail-Templates" description="Automatische Mailtexte, Platzhalter und Auslöser bearbeiten.">
        <MailTemplateManager initialTemplates={mailTemplates.map((template) => ({
          ...template,
          preview: renderMailTemplate(template, mailTemplatePreviewContext(template))
        }))} />
      </SettingsFold>
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

function SettingsFold({ title, description, children, open = false, className = "" }: { title: string; description: string; children: ReactNode; open?: boolean; className?: string }) {
  return (
    <details className={`overflow-hidden rounded-lg border border-line bg-white shadow-sm ${className}`} open={open}>
      <summary className="cursor-pointer list-none bg-[linear-gradient(135deg,#f7fcf8,#eef4ff)] p-4 [&::-webkit-details-marker]:hidden">
        <div className="inline-flex items-center gap-3">
          <span className="rounded bg-accent px-2 py-1 text-sm font-bold text-white">›</span>
          <span>
            <span className="block font-bold">{title}</span>
            <span className="mt-1 block text-sm font-normal text-muted">{description}</span>
          </span>
        </div>
      </summary>
      <div className="border-t border-line p-4">{children}</div>
    </details>
  );
}

function dedupeCategories<T extends { id: string; group: string; name: string; portalInstanceId: string | null }>(categories: T[], portalInstanceId: string | null) {
  const byLabel = new Map<string, T>();
  for (const category of categories) {
    const key = `${category.group.trim().toLowerCase()}\0${category.name.trim().toLowerCase()}`;
    const existing = byLabel.get(key);
    if (!existing || (category.portalInstanceId === portalInstanceId && existing.portalInstanceId !== portalInstanceId)) {
      byLabel.set(key, category);
    }
  }
  return Array.from(byLabel.values()).sort((a, b) => `${a.group} ${a.name}`.localeCompare(`${b.group} ${b.name}`, "de"));
}

function portalWhereForSettings(portalInstanceId: string | null) {
  return portalInstanceId ? { portalInstanceId } : {};
}
