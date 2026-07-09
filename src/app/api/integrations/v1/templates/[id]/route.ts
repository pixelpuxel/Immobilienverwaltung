import { rm } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { saveUpload } from "@/lib/files";
import { requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["write:contracts"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;

  const template = await prisma.contractTemplate.findFirst({ where: { id: params.id, ...portalWhere(user) } });
  if (!template) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Vorlage wurde nicht gefunden." } }, { status: 404 });

  const form = await request.formData();
  const name = String(form.get("name") || template.name).trim();
  const file = form.get("file");
  let propertyId = String(form.get("propertyId") || "").trim() || null;
  const unitId = String(form.get("unitId") || "").trim() || null;
  const defaultUnitIds = templateDefaultUnitIds(form);
  if (unitId) {
    const unit = await prisma.unit.findFirst({ where: { id: unitId, property: portalWhere(user) } });
    if (!unit) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Einheit gehoert nicht zu dieser Instanz." } }, { status: 403 });
    propertyId = unit.propertyId;
  }
  const isGlobalTemplate = unitId ? false : String(form.get("isGlobalTemplate") || "") === "true" || !propertyId;
  if (propertyId) {
    const property = await prisma.property.findFirst({ where: { id: propertyId, ...portalWhere(user) } });
    if (!property) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Immobilie gehoert nicht zu dieser Instanz." } }, { status: 403 });
  }
  if (defaultUnitIds.length) {
    const units = await prisma.unit.findMany({ where: { id: { in: defaultUnitIds }, property: portalWhere(user) }, select: { id: true } });
    if (units.length !== new Set(defaultUnitIds).size) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Mindestens eine Standard-Einheit gehoert nicht zu dieser Instanz." } }, { status: 403 });
  }

  const data: { name: string; propertyId: string | null; unitId: string | null; isGlobalTemplate: boolean; filename?: string; storagePath?: string; mimeType?: string; size?: number } = { name, propertyId, unitId, isGlobalTemplate };
  if (file instanceof File && file.size > 0) {
    if (!file.name.endsWith(".docx")) return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Bitte DOCX-Vorlage hochladen." } }, { status: 400 });
    const saved = await saveUpload(file, env.contractsPath);
    await rm(template.storagePath, { force: true }).catch(() => undefined);
    Object.assign(data, {
      filename: saved.filename,
      storagePath: saved.storagePath,
      mimeType: saved.mimeType,
      size: saved.size
    });
  }

  const updated = await prisma.contractTemplate.update({
    where: { id: template.id },
    data,
    select: {
      id: true,
      name: true,
      filename: true,
      mimeType: true,
      size: true,
      propertyId: true,
      unitId: true,
      isGlobalTemplate: true,
      property: { select: { id: true, name: true } },
      unit: { select: { id: true, unitNumber: true, property: { select: { id: true, name: true } } } },
      defaultForUnits: { select: { id: true, unitNumber: true, property: { select: { id: true, name: true } } } },
      createdAt: true
    }
  });
  await prisma.unit.updateMany({ where: { defaultContractTemplateId: template.id, property: portalWhere(user), id: { notIn: defaultUnitIds } }, data: { defaultContractTemplateId: null } });
  if (defaultUnitIds.length) {
    await prisma.unit.updateMany({ where: { id: { in: defaultUnitIds }, property: portalWhere(user) }, data: { defaultContractTemplateId: template.id } });
  }
  return NextResponse.json({
    ...updated,
    previewUrl: `/api/integrations/v1/templates/${updated.id}/preview`,
    downloadUrl: `/api/integrations/v1/templates/${updated.id}/download`
  });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["write:contracts"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;

  const template = await prisma.contractTemplate.findFirst({ where: { id: params.id, ...portalWhere(user) } });
  if (!template) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Vorlage wurde nicht gefunden." } }, { status: 404 });
  await prisma.contractTemplate.delete({ where: { id: template.id } });
  await rm(template.storagePath, { force: true }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}

function templateDefaultUnitIds(form: FormData) {
  return Array.from(new Set([
    ...form.getAll("defaultUnitIds").map((value) => String(value).trim()).filter(Boolean),
    ...Array.from(form.entries())
      .filter(([key]) => key.startsWith("defaultUnitIds["))
      .map(([, value]) => String(value).trim())
      .filter(Boolean)
  ]));
}
