import fs from "fs/promises";
import { AuditAction, Role } from "@prisma/client";
import { z } from "zod";
import { auditLog } from "./audit";
import { bestContractAttachment, contractPublicLinks } from "./contract-downloads";
import { generateContract, selectContractTemplate } from "./contracts";
import { canAccessDocument } from "./permissions";
import { portalWhere, type ScopedUser } from "./portal-instance";
import { prisma } from "./prisma";
import { globalSearch } from "./search";
import { generateWohnungsgeberbestaetigung } from "./wohnungsgeber";

export type AgentArtifact = {
  type: "link" | "pdf" | "docx" | "document";
  label: string;
  url: string;
};

export type AgentAttachment = {
  kind: "contract" | "document" | "wohnungsgeberbestaetigung";
  format: "pdf" | "docx";
  path: string;
  filename: string;
};

export type AgentToolResult = {
  name: string;
  ok: boolean;
  summary: string;
  href?: string;
  data?: unknown;
  artifacts?: AgentArtifact[];
  attachments?: AgentAttachment[];
  needsClarification?: boolean;
};

export type AgentContext = {
  user: ScopedUser;
  channel: "web" | "telegram";
};

export type AgentToolCall = {
  tool: string;
  args: Record<string, unknown>;
};

export type AgentToolDefinition = {
  name: string;
  description: string;
  parameters: string;
  schema: z.ZodTypeAny;
  kind: "read" | "write" | "send";
  requiresConfirmation?: boolean;
  getStatusMessage?: (args: any) => string;
  run: (ctx: AgentContext, args: any) => Promise<AgentToolResult>;
};

const querySchema = z.object({ query: z.string().trim().min(1).max(300) });
const optionalQuerySchema = z.object({ query: z.string().trim().max(300).optional().default("") });
const idSchema = z.object({ id: z.string().trim().min(1) });

const createContractSchema = z.object({
  tenantId: z.string().trim().optional(),
  tenantQuery: z.string().trim().max(300).optional(),
  propertyId: z.string().trim().optional(),
  propertyQuery: z.string().trim().max(300).optional(),
  unitId: z.string().trim().optional(),
  unitQuery: z.string().trim().max(300).optional(),
  templateId: z.string().trim().optional(),
  templateQuery: z.string().trim().max(300).optional(),
  testMode: z.boolean().optional().default(false)
});

const landlordConfirmationSchema = z.object({
  tenantId: z.string().trim().optional(),
  tenantQuery: z.string().trim().max(300).optional(),
  testMode: z.boolean().optional().default(false)
});

export const agentToolRegistry = {
  global_search: tool({
    name: "global_search",
    description: "Portalweite Suche ueber Immobilien, Einheiten, Dokumente, Mieter, Benutzer und Vertraege.",
    parameters: "{ query: string }",
    schema: querySchema,
    kind: "read",
    getStatusMessage: (args) => `Ich suche portalweit nach "${args.query}".`,
    run: async (ctx, args) => {
      const results = await globalSearch(ctx.user, args.query);
      return {
        name: "global_search",
        ok: true,
        summary: results.length
          ? [`${results.length} Treffer gefunden.`, ...results.slice(0, 10).map((item) => `- ${item.type}: ${item.title}${item.description ? ` (${item.description})` : ""}\n  ${item.href}`)].join("\n")
          : `Keine Treffer fuer "${args.query}" gefunden.`,
        data: results.slice(0, 20),
        artifacts: results.slice(0, 8).map((item) => ({ type: "link", label: `${item.type}: ${item.title}`, url: item.href }))
      };
    }
  }),
  search_properties: tool({
    name: "search_properties",
    description: "Immobilien suchen oder auflisten.",
    parameters: "{ query?: string }",
    schema: optionalQuerySchema,
    kind: "read",
    getStatusMessage: (args) => args.query ? `Ich suche Immobilien zu "${args.query}".` : "Ich lade die Immobilien.",
    run: async (ctx, args) => {
      const properties = await prisma.property.findMany({
        where: propertyWhere(ctx.user, args.query),
        orderBy: { updatedAt: "desc" },
        take: 20,
        include: { units: { select: { id: true } }, documents: { select: { id: true } } }
      });
      return {
        name: "search_properties",
        ok: true,
        summary: properties.length
          ? ["Immobilien:", ...properties.map((p) => `- ${p.name}: ${p.address || "keine Adresse"} (${p.units.length} Einheiten, ${p.documents.length} Dokumente) · /properties/${p.id}`)].join("\n")
          : "Keine Immobilien gefunden.",
        data: properties.map((p) => ({ id: p.id, name: p.name, address: p.address, href: `/properties/${p.id}` })),
        artifacts: properties.slice(0, 10).map((p) => ({ type: "link", label: p.name, url: `/properties/${p.id}` }))
      };
    }
  }),
  get_property: tool({
    name: "get_property",
    description: "Details zu einer konkreten Immobilie per ID laden.",
    parameters: "{ id: string }",
    schema: idSchema,
    kind: "read",
    getStatusMessage: () => "Ich lade die Immobilie.",
    run: async (ctx, args) => {
      const property = await prisma.property.findFirst({
        where: { id: args.id, ...propertyAccessWhere(ctx.user) },
        include: { units: { include: { tenants: { where: { isCurrent: true } } } }, documents: true }
      });
      if (!property) return failed("get_property", "Immobilie nicht gefunden oder nicht freigegeben.");
      return {
        name: "get_property",
        ok: true,
        summary: [`Immobilie: ${property.name}`, property.address, `${property.units.length} Einheiten`, `${property.documents.length} Dokumente`, `Link: /properties/${property.id}`].filter(Boolean).join("\n"),
        href: `/properties/${property.id}`,
        data: property,
        artifacts: [{ type: "link", label: property.name, url: `/properties/${property.id}` }]
      };
    }
  }),
  search_units: tool({
    name: "search_units",
    description: "Einheiten/Wohnungen suchen, optional passend zu einer Immobilie.",
    parameters: "{ query?: string, propertyQuery?: string, propertyId?: string }",
    schema: z.object({
      query: z.string().trim().max(300).optional().default(""),
      propertyQuery: z.string().trim().max(300).optional(),
      propertyId: z.string().trim().optional()
    }),
    kind: "read",
    getStatusMessage: () => "Ich suche passende Einheiten.",
    run: async (ctx, args) => {
      const units = await prisma.unit.findMany({
        where: unitWhere(ctx.user, args.query, args.propertyId, args.propertyQuery),
        include: { property: true, tenants: { where: { isCurrent: true } } },
        orderBy: { updatedAt: "desc" },
        take: 30
      });
      return {
        name: "search_units",
        ok: true,
        summary: units.length
          ? ["Einheiten:", ...units.map((u) => `- ${u.property.name} / ${u.unitNumber}: ${u.status || "kein Status"}${u.tenants.length ? ` · aktuell: ${u.tenants.map(tenantName).join(", ")}` : ""} · /properties/${u.propertyId}`)].join("\n")
          : "Keine Einheiten gefunden.",
        data: units.map((u) => ({ id: u.id, unitNumber: u.unitNumber, propertyId: u.propertyId, propertyName: u.property.name, href: `/properties/${u.propertyId}` })),
        artifacts: units.slice(0, 10).map((u) => ({ type: "link", label: `${u.property.name} / ${u.unitNumber}`, url: `/properties/${u.propertyId}` }))
      };
    }
  }),
  get_unit: tool({
    name: "get_unit",
    description: "Details zu einer Einheit per ID laden.",
    parameters: "{ id: string }",
    schema: idSchema,
    kind: "read",
    getStatusMessage: () => "Ich lade die Einheit.",
    run: async (ctx, args) => {
      const unit = await prisma.unit.findFirst({ where: { id: args.id, property: propertyAccessWhere(ctx.user) }, include: { property: true, tenants: true } });
      if (!unit) return failed("get_unit", "Einheit nicht gefunden oder nicht freigegeben.");
      return {
        name: "get_unit",
        ok: true,
        summary: [`Einheit: ${unit.property.name} / ${unit.unitNumber}`, unit.status, unit.tenants.length ? `Mieter: ${unit.tenants.map(tenantName).join(", ")}` : "Keine Mieter hinterlegt.", `Link: /properties/${unit.propertyId}`].filter(Boolean).join("\n"),
        href: `/properties/${unit.propertyId}`,
        data: unit,
        artifacts: [{ type: "link", label: `${unit.property.name} / ${unit.unitNumber}`, url: `/properties/${unit.propertyId}` }]
      };
    }
  }),
  search_tenants: tool({
    name: "search_tenants",
    description: "Mieter suchen oder aktuelle Mieter auflisten.",
    parameters: "{ query?: string, currentOnly?: boolean, propertyQuery?: string }",
    schema: z.object({
      query: z.string().trim().max(300).optional().default(""),
      currentOnly: z.boolean().optional().default(false),
      propertyQuery: z.string().trim().max(300).optional()
    }),
    kind: "read",
    getStatusMessage: (args) => args.query ? `Ich suche Mieter zu "${args.query}".` : "Ich lade die Mieter.",
    run: async (ctx, args) => {
      let tenants = await searchTenantRows(ctx.user, args.query, args.propertyQuery, args.currentOnly);
      if (!tenants.length && args.currentOnly && args.query && looksLikeCurrentTenantQuestion(args.query)) {
        tenants = await searchTenantRows(ctx.user, "", args.propertyQuery, true);
      }
      return {
        name: "search_tenants",
        ok: true,
        summary: tenants.length
          ? ["Mieter:", ...tenants.slice(0, 20).map((t) => `- ${tenantName(t)}${t.isCurrent ? " (laufend)" : ""}: ${t.unit ? `${t.unit.property.name} / ${t.unit.unitNumber}` : "keine Einheit"}${tenantDates(t) ? ` · ${tenantDates(t)}` : ""} · /users?tenantId=${t.id}`)].join("\n")
          : "Keine Mieter gefunden.",
        data: tenants.slice(0, 20).map((t) => ({ id: t.id, name: tenantName(t), unitId: t.unitId, propertyName: t.unit?.property.name, moveInDate: t.moveInDate, leaseStartDate: t.leaseStartDate, moveOutDate: t.moveOutDate, isCurrent: t.isCurrent, href: `/users?tenantId=${t.id}` })),
        artifacts: tenants.slice(0, 10).map((t) => ({ type: "link", label: tenantName(t), url: `/users?tenantId=${t.id}` }))
      };
    }
  }),
  get_tenant: tool({
    name: "get_tenant",
    description: "Details zu einem konkreten Mieter per ID laden.",
    parameters: "{ id: string }",
    schema: idSchema,
    kind: "read",
    getStatusMessage: () => "Ich lade den Mieter.",
    run: async (ctx, args) => {
      const tenant = await prisma.tenantProfile.findFirst({ where: { id: args.id, ...tenantAccessWhere(ctx.user) }, include: { unit: { include: { property: true } }, user: true } });
      if (!tenant) return failed("get_tenant", "Mieter nicht gefunden oder nicht freigegeben.");
      return {
        name: "get_tenant",
        ok: true,
        summary: [`Mieter: ${tenantName(tenant)}`, tenant.unit ? `${tenant.unit.property.name} / ${tenant.unit.unitNumber}` : "keine Einheit", tenant.isCurrent ? "laufend" : "nicht laufend", tenantDates(tenant), `Link: /users?tenantId=${tenant.id}`].filter(Boolean).join("\n"),
        href: `/users?tenantId=${tenant.id}`,
        data: tenant,
        artifacts: [{ type: "link", label: tenantName(tenant), url: `/users?tenantId=${tenant.id}` }]
      };
    }
  }),
  search_templates: tool({
    name: "search_templates",
    description: "Mietvertragsvorlagen suchen, optional passend zu einer Immobilie.",
    parameters: "{ query?: string, propertyId?: string }",
    schema: z.object({ query: z.string().trim().max(300).optional().default(""), propertyId: z.string().trim().optional() }),
    kind: "read",
    getStatusMessage: () => "Ich suche Vertragsvorlagen.",
    run: async (ctx, args) => {
      if (ctx.user.role !== Role.ADMIN) return failed("search_templates", "Vertragsvorlagen sind nur fuer Eigentuemer/Admins sichtbar.");
      const templates = await prisma.contractTemplate.findMany({
        where: {
          portalInstanceId: ctx.user.portalInstanceId,
          ...(args.propertyId ? { OR: [{ propertyId: args.propertyId }, { isGlobalTemplate: true, propertyId: null }] } : {}),
          ...(args.query ? { name: { contains: args.query, mode: "insensitive" } } : {})
        },
        include: { property: true },
        orderBy: [{ propertyId: "desc" }, { createdAt: "desc" }],
        take: 20
      });
      return {
        name: "search_templates",
        ok: true,
        summary: templates.length ? ["Vorlagen:", ...templates.map((t) => `- ${t.name}: ${t.property?.name || "Allgemein"} (${t.id})`)].join("\n") : "Keine Vorlagen gefunden.",
        data: templates.map((t) => ({ id: t.id, name: t.name, propertyId: t.propertyId, propertyName: t.property?.name || null }))
      };
    }
  }),
  get_template: tool({
    name: "get_template",
    description: "Details zu einer Vertragsvorlage per ID laden.",
    parameters: "{ id: string }",
    schema: idSchema,
    kind: "read",
    getStatusMessage: () => "Ich lade die Vertragsvorlage.",
    run: async (ctx, args) => {
      if (ctx.user.role !== Role.ADMIN) return failed("get_template", "Vertragsvorlagen sind nur fuer Eigentuemer/Admins sichtbar.");
      const template = await prisma.contractTemplate.findFirst({ where: { id: args.id, portalInstanceId: ctx.user.portalInstanceId }, include: { property: true } });
      if (!template) return failed("get_template", "Vorlage nicht gefunden.");
      return { name: "get_template", ok: true, summary: `Vorlage: ${template.name}\nZuordnung: ${template.property?.name || "Allgemein"}`, data: template };
    }
  }),
  search_documents: tool({
    name: "search_documents",
    description: "Dokumente suchen.",
    parameters: "{ query: string }",
    schema: querySchema,
    kind: "read",
    getStatusMessage: (args) => `Ich suche Dokumente zu "${args.query}".`,
    run: async (ctx, args) => {
      const results = (await globalSearch(ctx.user, args.query)).filter((item) => item.type === "Dokument");
      return {
        name: "search_documents",
        ok: true,
        summary: results.length ? ["Dokumente:", ...results.slice(0, 12).map((item) => `- ${item.title}${item.description ? ` (${item.description})` : ""}\n  ${item.href}`)].join("\n") : "Keine Dokumente gefunden.",
        data: results.slice(0, 20),
        artifacts: results.slice(0, 10).map((item) => ({ type: "link", label: item.title, url: item.href }))
      };
    }
  }),
  get_document: tool({
    name: "get_document",
    description: "Dokumentdetails per ID laden.",
    parameters: "{ id: string }",
    schema: idSchema,
    kind: "read",
    getStatusMessage: () => "Ich lade das Dokument.",
    run: async (ctx, args) => {
      if (!(await canAccessDocument(ctx.user, args.id, false))) return failed("get_document", "Dokument nicht gefunden oder nicht freigegeben.");
      const document = await prisma.document.findUnique({ where: { id: args.id }, include: { property: true, unit: { include: { property: true } }, category: true } });
      if (!document) return failed("get_document", "Dokument nicht gefunden.");
      return {
        name: "get_document",
        ok: true,
        summary: [`Dokument: ${document.title}`, document.summary, document.category ? `${document.category.group} / ${document.category.name}` : null, `Vorschau: /api/documents/${document.id}/preview`].filter(Boolean).join("\n"),
        href: `/api/documents/${document.id}/preview`,
        data: document,
        artifacts: [{ type: "document", label: document.title, url: `/api/documents/${document.id}/preview` }]
      };
    }
  }),
  get_document_download_url: tool({
    name: "get_document_download_url",
    description: "Geschuetzten Download-Link fuer ein Dokument erzeugen.",
    parameters: "{ id: string }",
    schema: idSchema,
    kind: "read",
    getStatusMessage: () => "Ich bereite den Dokument-Download vor.",
    run: async (ctx, args) => {
      if (!(await canAccessDocument(ctx.user, args.id, true))) return failed("get_document_download_url", "Download nicht erlaubt oder Dokument nicht gefunden.");
      const document = await prisma.document.findUnique({ where: { id: args.id } });
      if (!document) return failed("get_document_download_url", "Dokument nicht gefunden.");
      return {
        name: "get_document_download_url",
        ok: true,
        summary: `Download-Link fuer ${document.title}: /api/documents/${document.id}/download`,
        href: `/api/documents/${document.id}/download`,
        data: { id: document.id, url: `/api/documents/${document.id}/download` },
        artifacts: [{ type: "document", label: `${document.title} herunterladen`, url: `/api/documents/${document.id}/download` }]
      };
    }
  }),
  render_document_pdf: tool({
    name: "render_document_pdf",
    description: "PDF-Rendering fuer Dokumente. Aktuell werden bereits vorhandene PDF/Preview-Routen genutzt.",
    parameters: "{ id: string }",
    schema: idSchema,
    kind: "read",
    getStatusMessage: () => "Ich pruefe die PDF-Vorschau.",
    run: async (ctx, args) => {
      if (!(await canAccessDocument(ctx.user, args.id, false))) return failed("render_document_pdf", "Dokument nicht gefunden oder nicht freigegeben.");
      return { name: "render_document_pdf", ok: true, summary: `PDF/Vorschau ist ueber /api/documents/${args.id}/preview abrufbar.`, href: `/api/documents/${args.id}/preview`, artifacts: [{ type: "pdf", label: "PDF-Vorschau", url: `/api/documents/${args.id}/preview` }] };
    }
  }),
  create_contract: tool({
    name: "create_contract",
    description: "Mietvertrag fuer einen eindeutig bestimmten vorhandenen Mieter erzeugen, inklusive DOCX/PDF und Download-Links.",
    parameters: "{ tenantId?: string, tenantQuery?: string, propertyId?: string, propertyQuery?: string, unitId?: string, unitQuery?: string, templateId?: string, templateQuery?: string, testMode?: boolean }",
    schema: createContractSchema,
    kind: "write",
    requiresConfirmation: true,
    getStatusMessage: () => "Ich pruefe Mieter, Einheit und Vorlage und erstelle den Vertrag.",
    run: createContractTool
  }),
  create_landlord_confirmation: tool({
    name: "create_landlord_confirmation",
    description: "Wohnungsgeberbestaetigung fuer einen eindeutig bestimmten vorhandenen Mieter erzeugen.",
    parameters: "{ tenantId?: string, tenantQuery?: string, testMode?: boolean }",
    schema: landlordConfirmationSchema,
    kind: "write",
    requiresConfirmation: true,
    getStatusMessage: () => "Ich erstelle die Wohnungsgeberbestaetigung.",
    run: createLandlordConfirmationTool
  }),
  send_telegram_document: tool({
    name: "send_telegram_document",
    description: "Telegram-Dateiversand wird serverseitig automatisch fuer erzeugte Vertrags-/PDF-Anhaenge ausgefuehrt.",
    parameters: "{ note?: string }",
    schema: z.object({ note: z.string().optional() }),
    kind: "send",
    getStatusMessage: () => "Ich bereite den Telegram-Dateiversand vor.",
    run: async (ctx) => ctx.channel === "telegram"
      ? { name: "send_telegram_document", ok: true, summary: "Telegram-Dateianhaenge werden nach der Antwort automatisch als Datei gesendet." }
      : failed("send_telegram_document", "Telegram-Versand ist nur im Telegram-Kanal verfuegbar.")
  })
};

export type AgentToolName = keyof typeof agentToolRegistry;

export function toolListForPrompt() {
  return Object.values(agentToolRegistry)
    .map((definition) => `- ${definition.name} (${definition.kind})${definition.requiresConfirmation ? " [vorsichtig/schreibend]" : ""}: ${definition.description}\n  Parameter: ${definition.parameters}`)
    .join("\n");
}

export function validateAgentToolCalls(calls: unknown): Array<{ definition: AgentToolDefinition; args: Record<string, unknown> }> {
  const list = Array.isArray(calls) ? calls : [];
  return list.map((call) => {
    const parsed = z.object({ tool: z.string(), args: z.record(z.unknown()).optional().default({}) }).parse(call);
    const definition = agentToolRegistry[parsed.tool as AgentToolName];
    if (!definition) throw new Error(`Unbekanntes Agent-Tool: ${parsed.tool}`);
    return { definition, args: definition.schema.parse(parsed.args) as Record<string, unknown> };
  });
}

export async function executeValidatedToolCalls(
  ctx: AgentContext,
  calls: Array<{ definition: AgentToolDefinition; args: Record<string, unknown> }>,
  onEvent?: (event: { type: "tool_start" | "tool_result"; tool: string; message?: string; summary?: string }) => void
) {
  const results: AgentToolResult[] = [];
  for (const call of calls) {
    const typedArgs = call.args as never;
    onEvent?.({ type: "tool_start", tool: call.definition.name, message: call.definition.getStatusMessage?.(typedArgs) || `Ich fuehre ${call.definition.name} aus.` });
    try {
      const result = await call.definition.run(ctx, typedArgs);
      results.push(result);
      onEvent?.({ type: "tool_result", tool: call.definition.name, summary: summarizeResult(result.summary) });
    } catch (error) {
      const result = failed(call.definition.name, error instanceof Error ? error.message : "Tool fehlgeschlagen.");
      results.push(result);
      onEvent?.({ type: "tool_result", tool: call.definition.name, summary: result.summary });
    }
  }
  return results;
}

function tool(definition: AgentToolDefinition) {
  return definition;
}

function failed(name: string, summary: string): AgentToolResult {
  return { name, ok: false, summary };
}

function summarizeResult(value: string) {
  return value.split("\n").slice(0, 2).join(" ");
}

function propertyAccessWhere(user: ScopedUser) {
  if (user.role === Role.ADMIN) return portalWhere(user);
  if (user.role === Role.TENANT) return { units: { some: { tenants: { some: { userId: user.id } } } } };
  return { brokerRequests: { some: { userId: user.id, status: "active" } } };
}

function propertyWhere(user: ScopedUser, query?: string) {
  const access = propertyAccessWhere(user);
  if (!query) return access;
  return {
    ...access,
    OR: [
      { name: { contains: query, mode: "insensitive" as const } },
      { address: { contains: query, mode: "insensitive" as const } },
      { street: { contains: query, mode: "insensitive" as const } },
      { city: { contains: query, mode: "insensitive" as const } },
      { objectType: { contains: query, mode: "insensitive" as const } }
    ]
  };
}

function unitWhere(user: ScopedUser, query?: string, propertyId?: string, propertyQuery?: string) {
  return {
    property: propertyWhere(user, propertyQuery),
    ...(propertyId ? { propertyId } : {}),
    ...(query ? {
      OR: [
        { unitNumber: { contains: query, mode: "insensitive" as const } },
        { floor: { contains: query, mode: "insensitive" as const } },
        { status: { contains: query, mode: "insensitive" as const } }
      ]
    } : {})
  };
}

function tenantAccessWhere(user: ScopedUser) {
  if (user.role === Role.ADMIN) return { user: portalWhere(user) };
  if (user.role === Role.BROKER) return { isCurrent: true, unit: { property: propertyAccessWhere(user) } };
  return { userId: user.id };
}

async function searchTenantRows(user: ScopedUser, query = "", propertyQuery?: string, currentOnly = false) {
  const rows = await prisma.tenantProfile.findMany({
    where: {
      ...tenantAccessWhere(user),
      ...(currentOnly ? { isCurrent: true } : {}),
      ...(propertyQuery ? { unit: { property: propertyWhere(user, propertyQuery) } } : {})
    },
    include: { unit: { include: { property: true } }, user: true },
    orderBy: [{ isCurrent: "desc" }, { updatedAt: "desc" }],
    take: 200
  });
  if (!query) return rows.slice(0, 50);
  const scored = rows
    .map((tenant) => ({ tenant, score: scoreText(query, [tenantName(tenant), tenant.email, tenant.unit?.unitNumber, tenant.unit?.property.name, tenant.unit?.property.address]) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.map((item) => item.tenant).slice(0, 50);
}

async function createContractTool(ctx: AgentContext, args: z.infer<typeof createContractSchema>): Promise<AgentToolResult> {
  if (ctx.user.role !== Role.ADMIN) return failed("create_contract", "Mietvertraege koennen nur mit Eigentuemer-/Adminrechten erzeugt werden.");
  const tenantMatch = await resolveTenant(ctx.user, args.tenantId, args.tenantQuery, args.propertyQuery);
  if (!tenantMatch.ok) return tenantMatch.result;
  const tenant = tenantMatch.tenant;
  if (!tenant.unitId || !tenant.unit) return failed("create_contract", `Fuer ${tenantName(tenant)} ist keine Einheit zugeordnet.`);
  if (args.unitId && args.unitId !== tenant.unitId) return failed("create_contract", "Der angegebene Mieter gehoert nicht zu dieser Einheit.");
  if (args.propertyId && args.propertyId !== tenant.unit.propertyId) return failed("create_contract", "Der angegebene Mieter gehoert nicht zu dieser Immobilie.");

  const template = args.templateId
    ? await selectContractTemplate({ portalInstanceId: ctx.user.portalInstanceId, propertyId: tenant.unit.propertyId, templateId: args.templateId })
    : await resolveTemplate(ctx.user.portalInstanceId, tenant.unit.propertyId, args.templateQuery);
  if (template === "ambiguous") {
    const templates = await prisma.contractTemplate.findMany({ where: { portalInstanceId: ctx.user.portalInstanceId, OR: [{ propertyId: tenant.unit.propertyId }, { isGlobalTemplate: true, propertyId: null }] }, orderBy: [{ propertyId: "desc" }, { createdAt: "desc" }], take: 8 });
    return { name: "create_contract", ok: false, needsClarification: true, summary: ["Mehrere passende Vorlagen gefunden. Bitte eine Vorlage nennen:", ...templates.map((item, index) => `${index + 1}. ${item.name}`)].join("\n") };
  }

  const generated = await generateContract({ tenantProfileId: tenant.id, unitId: tenant.unitId, templateId: template?.id || null });
  const contract = await prisma.leaseContract.create({
    data: {
      tenantProfileId: tenant.id,
      unitId: tenant.unitId,
      templateId: template?.id || null,
      docxPath: generated.docxPath,
      pdfPath: generated.pdfPath
    }
  });
  await auditLog({ userId: ctx.user.id, action: AuditAction.CONTRACT_GENERATED, entity: "LeaseContract", entityId: contract.id, detail: { source: "agent-tool", testMode: args.testMode } });

  const links = contractPublicLinks(contract.id, Boolean(contract.pdfPath), { absolute: ctx.channel === "telegram", signed: ctx.channel === "telegram", expiresInSeconds: 24 * 60 * 60 });
  const attachment = bestContractAttachment(contract, `Mietvertrag_${tenantName(tenant)}`);
  const artifacts: AgentArtifact[] = [
    { type: "link", label: "Vertragsvorschau", url: links.preview },
    { type: "docx", label: "Mietvertrag DOCX", url: links.docx }
  ];
  if (links.pdf) artifacts.push({ type: "pdf", label: "Mietvertrag PDF", url: links.pdf });
  const summary = [
    args.testMode ? "Testmodus: Mietvertrag wurde erzeugt und danach wieder entfernt." : "Mietvertrag wurde erstellt.",
    `Mieter: ${tenantName(tenant)}`,
    `Immobilie: ${tenant.unit.property.name}`,
    `Einheit: ${tenant.unit.unitNumber}`,
    `Verwendete Vorlage: ${template?.name || "Interner Standardvertrag"}`,
    `Vertrags-ID: ${contract.id}`,
    `Vorschau-Link: ${links.preview}`,
    `DOCX-Link: ${links.docx}`,
    links.pdf ? `PDF-Link: ${links.pdf}` : "PDF konnte nicht erzeugt werden; DOCX ist verfuegbar."
  ].join("\n");

  if (args.testMode) {
    await prisma.leaseContract.delete({ where: { id: contract.id } }).catch(() => undefined);
    await fs.rm(generated.docxPath, { force: true }).catch(() => undefined);
    if (generated.pdfPath) await fs.rm(generated.pdfPath, { force: true }).catch(() => undefined);
    return { name: "create_contract", ok: true, summary, data: { testMode: true }, artifacts: [] };
  }

  return {
    name: "create_contract",
    ok: true,
    summary,
    href: links.preview,
    data: { contractId: contract.id, pdfAvailable: Boolean(contract.pdfPath), templateName: template?.name || "Interner Standardvertrag" },
    artifacts,
    attachments: [{ kind: "contract", format: attachment.format, path: attachment.path, filename: attachment.filename }]
  };
}

async function createLandlordConfirmationTool(ctx: AgentContext, args: z.infer<typeof landlordConfirmationSchema>): Promise<AgentToolResult> {
  if (ctx.user.role !== Role.ADMIN) return failed("create_landlord_confirmation", "Wohnungsgeberbestaetigungen koennen nur mit Eigentuemer-/Adminrechten erzeugt werden.");
  const tenantMatch = await resolveTenant(ctx.user, args.tenantId, args.tenantQuery);
  if (!tenantMatch.ok) return tenantMatch.result;
  const document = await generateWohnungsgeberbestaetigung({ tenantProfileId: tenantMatch.tenant.id, actorUserId: ctx.user.id });
  const summary = [
    args.testMode ? "Testmodus: Wohnungsgeberbestaetigung wurde erzeugt und danach wieder entfernt." : "Wohnungsgeberbestaetigung wurde erzeugt.",
    `Mieter: ${tenantName(tenantMatch.tenant)}`,
    `Dokument-ID: ${document.id}`,
    `Vorschau-Link: /api/documents/${document.id}/preview`,
    `PDF-Link: /api/documents/${document.id}/download`
  ].join("\n");
  if (args.testMode) {
    await prisma.document.delete({ where: { id: document.id } }).catch(() => undefined);
    if (document.storagePath) await fs.rm(document.storagePath, { force: true }).catch(() => undefined);
    return { name: "create_landlord_confirmation", ok: true, summary };
  }
  return {
    name: "create_landlord_confirmation",
    ok: true,
    summary,
    href: `/api/documents/${document.id}/preview`,
    artifacts: [{ type: "pdf" as const, label: "Wohnungsgeberbestaetigung PDF", url: `/api/documents/${document.id}/download` }],
    attachments: [{ kind: "wohnungsgeberbestaetigung" as const, format: "pdf" as const, path: document.storagePath, filename: document.filename }]
  };
}

async function resolveTenant(user: ScopedUser, tenantId?: string, tenantQuery?: string, propertyQuery?: string): Promise<{ ok: true; tenant: Awaited<ReturnType<typeof searchTenantRows>>[number] } | { ok: false; result: AgentToolResult }> {
  if (tenantId) {
    const tenant = await prisma.tenantProfile.findFirst({ where: { id: tenantId, ...tenantAccessWhere(user) }, include: { unit: { include: { property: true } }, user: true } });
    return tenant ? { ok: true, tenant } : { ok: false, result: failed("create_contract", "Mieter-ID nicht gefunden oder nicht freigegeben.") };
  }
  const candidates = await searchTenantRows(user, tenantQuery || "", propertyQuery, false);
  const propertyCandidates = !candidates.length && propertyQuery
    ? await searchTenantRows(user, "", propertyQuery, true)
    : [];
  const effectiveCandidates = candidates.length ? candidates : propertyCandidates;
  if (!effectiveCandidates.length) {
    return {
      ok: false,
      result: {
        ...failed("create_contract", "Kein passender Mieter gefunden. Ich konnte auch keinen aktuellen Mieter zur genannten Immobilie eindeutig ermitteln. Bitte Mieter genauer benennen oder zuerst anlegen."),
        needsClarification: true
      }
    };
  }
  const scored = effectiveCandidates.map((tenant) => ({ tenant, score: scoreText(`${tenantQuery || ""} ${propertyQuery || ""}`, [tenantName(tenant), tenant.email, tenant.unit?.property.name, tenant.unit?.property.address, tenant.unit?.unitNumber]) })).sort((a, b) => b.score - a.score);
  if (scored.length > 1 && scored[0].score <= scored[1].score) {
    return {
      ok: false,
      result: {
        name: "create_contract",
        ok: false,
        needsClarification: true,
        summary: ["Mehrere Mieter passen. Bitte waehle genauer:", ...scored.slice(0, 6).map((item, index) => `${index + 1}. ${tenantName(item.tenant)} - ${item.tenant.unit ? `${item.tenant.unit.property.name} / ${item.tenant.unit.unitNumber}` : "keine Einheit"}`)].join("\n"),
        data: scored.slice(0, 6).map((item) => ({ id: item.tenant.id, name: tenantName(item.tenant) }))
      }
    };
  }
  return { ok: true, tenant: scored[0].tenant };
}

async function resolveTemplate(portalInstanceId: string | null, propertyId: string, templateQuery?: string) {
  const templates = await prisma.contractTemplate.findMany({
    where: { portalInstanceId, OR: [{ propertyId }, { isGlobalTemplate: true, propertyId: null }] },
    include: { property: true },
    orderBy: [{ propertyId: "desc" }, { createdAt: "desc" }]
  });
  if (!templates.length) return null;
  if (templateQuery) {
    const scored = templates.map((template) => ({ template, score: scoreText(templateQuery, [template.name, template.property?.name]) })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
    if (scored.length === 1 || (scored.length > 1 && scored[0].score > scored[1].score)) return scored[0].template;
  }
  const propertySpecific = templates.filter((template) => template.propertyId === propertyId);
  if (propertySpecific.length === 1) return propertySpecific[0];
  if (propertySpecific.length > 1) return "ambiguous" as const;
  const global = templates.filter((template) => template.isGlobalTemplate && !template.propertyId);
  if (global.length === 1) return global[0];
  if (global.length > 1) return "ambiguous" as const;
  return null;
}

function tenantName(tenant: { firstName: string; lastName: string; email?: string }) {
  return `${tenant.firstName || ""} ${tenant.lastName || ""}`.trim() || tenant.email || "Mieter";
}

function tenantDates(tenant: { moveInDate?: Date | null; leaseStartDate?: Date | null; moveOutDate?: Date | null }) {
  return [
    tenant.moveInDate ? `Einzug: ${formatDate(tenant.moveInDate)}` : null,
    tenant.leaseStartDate ? `Mietbeginn: ${formatDate(tenant.leaseStartDate)}` : null,
    tenant.moveOutDate ? `Auszug: ${formatDate(tenant.moveOutDate)}` : null
  ].filter(Boolean).join(" · ");
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(value);
}

function scoreText(query: string, values: Array<string | null | undefined>) {
  const normalizedQuery = normalize(query);
  const haystack = normalize(values.filter(Boolean).join(" "));
  if (!normalizedQuery.trim()) return 1;
  const tokens = normalizedQuery.split(/[^a-z0-9]+/).filter((token) => token.length > 2 && !STOP_WORDS.has(token));
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? token.length : 0), haystack.includes(normalizedQuery.trim()) ? 100 : 0);
}

function normalize(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss");
}

const STOP_WORDS = new Set(["bitte", "mach", "mache", "einen", "eine", "vertrag", "mietvertrag", "fuer", "für", "erstelle", "erzeuge", "generiere", "in", "der", "die", "das", "den", "dem", "zur", "zum"]);

function looksLikeCurrentTenantQuestion(value: string) {
  return /(wer|wohnt|bewohner|aktuell|laufend|objekt|objekte|immobilien)/i.test(normalize(value));
}
