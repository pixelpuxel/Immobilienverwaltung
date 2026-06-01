import { AuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { clientIp } from "@/lib/auth";
import { generateContract } from "@/lib/contracts";
import { integrationError, requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  query: z.string().trim(),
  dryRun: z.boolean().optional().default(false)
});

export async function POST(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["read:tenants", "read:contracts", "write:contracts"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;
  const body = schema.safeParse(await request.json());
  if (!body.success) return integrationError("BAD_REQUEST", "Ungueltige Anfrage.", 400);
  if (!body.data.query) {
    return NextResponse.json({
      ok: false,
      status: "missing_query",
      reply: [
        "Bitte gib einen Mieter an.",
        "",
        "Beispiele:",
        "/vertrag Max",
        "/vertrag Alina",
        "",
        "Ich suche dann den aktuellen Mieter, waehle die passende Vorlage und erzeuge den Mietvertrag im Portal."
      ].join("\n"),
      debug: {
        query: "",
        dryRun: body.data.dryRun,
        expectedInput: "/vertrag Name"
      }
    });
  }

  const tenants = await prisma.tenantProfile.findMany({
    where: { user: portalWhere(user), isCurrent: true },
    include: { unit: { include: { property: { select: { id: true, name: true } } } }, user: { select: { id: true, email: true, username: true } } },
    orderBy: [{ isCurrent: "desc" }, { updatedAt: "desc" }]
  });
  const needle = normalize(body.data.query);
  const matches = tenants.filter((tenant) => normalize([
    tenant.firstName,
    tenant.lastName,
    tenant.email,
    tenant.user.username,
    tenant.unit?.unitNumber,
    tenant.unit?.property?.name
  ].filter(Boolean).join(" ")).includes(needle));

  if (!matches.length) {
    return NextResponse.json({
      ok: false,
      status: "tenant_not_found",
      reply: `Ich habe keinen aktuellen Mieter zu "${body.data.query}" gefunden.`,
      debug: {
        query: body.data.query,
        tenantCount: tenants.length,
        availableTenants: tenants.slice(0, 20).map(compactTenant)
      }
    });
  }

  if (matches.length > 1) {
    return NextResponse.json({
      ok: false,
      status: "multiple_tenants_found",
      reply: "Ich habe mehrere Mieter gefunden. Bitte genauer suchen.",
      debug: {
        query: body.data.query,
        matches: matches.slice(0, 20).map(compactTenant)
      }
    });
  }

  const tenant = matches[0];
  if (!tenant.unitId || !tenant.unit) {
    return NextResponse.json({
      ok: false,
      status: "tenant_without_unit",
      reply: `Bei ${tenant.firstName} ${tenant.lastName} ist keine Einheit hinterlegt.`,
      debug: { query: body.data.query, tenant: compactTenant(tenant) }
    });
  }

  const templates = await prisma.contractTemplate.findMany({
    where: portalWhere(user),
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, filename: true, mimeType: true, size: true, createdAt: true }
  });
  const template = pickTemplate(templates, tenant.unit.property.name);
  const debug = {
    query: body.data.query,
    dryRun: body.data.dryRun,
    tenant: compactTenant(tenant),
    template: template ? {
      ...template,
      previewUrl: absoluteUrl(request, `/api/templates/${template.id}/preview`),
      downloadUrl: absoluteUrl(request, `/api/templates/${template.id}/download`)
    } : null,
    request: {
      tenantProfileId: tenant.id,
      unitId: tenant.unitId,
      templateId: template?.id || null
    }
  };

  if (body.data.dryRun) {
    return NextResponse.json({
      ok: true,
      status: "ready",
      reply: `Bereit fuer ${tenant.firstName} ${tenant.lastName}.`,
      debug
    });
  }

  const generated = await generateContract({ tenantProfileId: tenant.id, unitId: tenant.unitId, templateId: template?.id || null });
  const contract = await prisma.leaseContract.create({
    data: {
      tenantProfileId: tenant.id,
      unitId: tenant.unitId,
      templateId: template?.id || null,
      docxPath: generated.docxPath,
      pdfPath: generated.pdfPath
    },
    include: { tenantProfile: true, unit: { include: { property: { select: { id: true, name: true } } } }, template: { select: { id: true, name: true } } }
  });
  await auditLog({ userId: user.id, action: AuditAction.CONTRACT_GENERATED, entity: "LeaseContract", entityId: contract.id, ipAddress: clientIp(request) });

  const result = {
    id: contract.id,
    tenantProfileId: contract.tenantProfileId,
    unitId: contract.unitId,
    template: contract.template,
    tenantProfile: contract.tenantProfile,
    unit: contract.unit,
    createdAt: contract.createdAt,
    previewUrl: absoluteUrl(request, `/api/contracts/${contract.id}/preview`),
    docxDownloadUrl: absoluteUrl(request, `/api/contracts/${contract.id}/download?format=docx`),
    pdfDownloadUrl: absoluteUrl(request, `/api/contracts/${contract.id}/download?format=pdf`)
  };

  return NextResponse.json({
    ok: true,
    status: "contract_created",
    reply: [
      `Mietvertrag erstellt: ${tenant.firstName} ${tenant.lastName}`,
      `Immobilie: ${tenant.unit.property.name}`,
      `Einheit: ${tenant.unit.unitNumber}`,
      `Vorlage: ${template?.name || "Standardvertrag"}`,
      "",
      `Vorschau: ${result.previewUrl}`,
      `DOCX: ${result.docxDownloadUrl}`,
      `PDF: ${result.pdfDownloadUrl}`
    ].join("\n"),
    debug,
    contract: result
  }, { status: 201 });
}

function normalize(value: unknown) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss");
}

function compactTenant(tenant: {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  unitId: string | null;
  unit?: { unitNumber: string; property: { id: string; name: string } } | null;
  user?: { email: string; username: string | null } | null;
}) {
  return {
    id: tenant.id,
    name: `${tenant.firstName} ${tenant.lastName}`.trim(),
    email: tenant.email || tenant.user?.email || "",
    username: tenant.user?.username || null,
    unitId: tenant.unitId,
    unitNumber: tenant.unit?.unitNumber || null,
    propertyId: tenant.unit?.property.id || null,
    propertyName: tenant.unit?.property.name || null
  };
}

function pickTemplate<T extends { id: string; name: string }>(templates: T[], propertyName: string) {
  const propertyKey = normalize(propertyName);
  return templates.find((item) => propertyKey && normalize(item.name).includes(propertyKey.split(" ")[0]))
    || templates.find((item) => propertyKey.includes("mainau") && normalize(item.name).includes("mainau"))
    || templates.find((item) => propertyKey.includes("tiroler") && normalize(item.name).includes("tiroler"))
    || templates[0]
    || null;
}

function absoluteUrl(request: NextRequest, path: string) {
  const appUrl = process.env.APP_URL || request.nextUrl.origin;
  return `${appUrl.replace(/\/$/, "")}${path}`;
}
