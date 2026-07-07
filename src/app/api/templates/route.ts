import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { saveUpload } from "@/lib/files";
import { env } from "@/lib/env";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  return NextResponse.json(await prisma.contractTemplate.findMany({ where: portalWhere(user), include: { property: true, unit: { include: { property: true } }, defaultForUnits: { include: { property: true } } }, orderBy: { createdAt: "desc" } }));
}

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.name.endsWith(".docx")) {
    return NextResponse.json({ error: "Bitte DOCX-Vorlage hochladen." }, { status: 400 });
  }
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
  const saved = await saveUpload(file, env.contractsPath);
  const template = await prisma.contractTemplate.create({
    data: {
      name: String(form.get("name") || file.name),
      propertyId,
      unitId,
      isGlobalTemplate,
      filename: saved.filename,
      storagePath: saved.storagePath,
      mimeType: saved.mimeType,
      size: saved.size,
      portalInstanceId: user.portalInstanceId
    }
  });
  if (defaultUnitIds.length) {
    await prisma.unit.updateMany({ where: { id: { in: defaultUnitIds }, property: portalWhere(user) }, data: { defaultContractTemplateId: template.id } });
  }
  return NextResponse.json(template, { status: 201 });
}
