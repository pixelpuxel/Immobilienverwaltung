import { rm } from "fs/promises";
import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { saveUpload } from "@/lib/files";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });

  const template = await prisma.contractTemplate.findFirst({ where: { id: params.id, ...portalWhere(user) } });
  if (!template) return NextResponse.json({ error: "Vorlage wurde nicht gefunden." }, { status: 404 });

  const form = await request.formData();
  const name = String(form.get("name") || template.name).trim();
  const file = form.get("file");
  let propertyId = String(form.get("propertyId") || "").trim() || null;
  const unitId = String(form.get("unitId") || "").trim() || null;
  const defaultUnitIds = form.getAll("defaultUnitIds").map((value) => String(value).trim()).filter(Boolean);
  if (unitId) {
    const unit = await prisma.unit.findFirst({ where: { id: unitId, property: portalWhere(user) } });
    if (!unit) return NextResponse.json({ error: "Einheit gehoert nicht zu dieser Instanz." }, { status: 403 });
    propertyId = unit.propertyId;
  }
  const isGlobalTemplate = unitId ? false : form.get("isGlobalTemplate") === "on" || !propertyId;
  if (propertyId) {
    const property = await prisma.property.findFirst({ where: { id: propertyId, ...portalWhere(user) } });
    if (!property) return NextResponse.json({ error: "Immobilie gehoert nicht zu dieser Instanz." }, { status: 403 });
  }
  if (defaultUnitIds.length) {
    const units = await prisma.unit.findMany({ where: { id: { in: defaultUnitIds }, property: portalWhere(user) }, select: { id: true } });
    if (units.length !== new Set(defaultUnitIds).size) return NextResponse.json({ error: "Mindestens eine Standard-Einheit gehoert nicht zu dieser Instanz." }, { status: 403 });
  }
  const data: { name: string; propertyId: string | null; unitId: string | null; isGlobalTemplate: boolean; filename?: string; storagePath?: string; mimeType?: string; size?: number } = { name, propertyId, unitId, isGlobalTemplate };
  if (file instanceof File && file.size > 0) {
    if (!file.name.endsWith(".docx")) return NextResponse.json({ error: "Bitte DOCX-Vorlage hochladen." }, { status: 400 });
    const saved = await saveUpload(file, env.contractsPath);
    await rm(template.storagePath, { force: true }).catch(() => undefined);
    Object.assign(data, {
      filename: saved.filename,
      storagePath: saved.storagePath,
      mimeType: saved.mimeType,
      size: saved.size
    });
  }

  const updated = await prisma.contractTemplate.update({ where: { id: template.id }, data });
  await prisma.unit.updateMany({ where: { defaultContractTemplateId: template.id, property: portalWhere(user), id: { notIn: defaultUnitIds } }, data: { defaultContractTemplateId: null } });
  if (defaultUnitIds.length) {
    await prisma.unit.updateMany({ where: { id: { in: defaultUnitIds }, property: portalWhere(user) }, data: { defaultContractTemplateId: template.id } });
  }
  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });

  const template = await prisma.contractTemplate.findFirst({ where: { id: params.id, ...portalWhere(user) } });
  if (!template) return NextResponse.json({ error: "Vorlage wurde nicht gefunden." }, { status: 404 });
  await prisma.contractTemplate.delete({ where: { id: template.id } });
  await rm(template.storagePath, { force: true }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
