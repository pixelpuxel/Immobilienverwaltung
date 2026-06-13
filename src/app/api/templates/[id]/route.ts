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
  const propertyId = String(form.get("propertyId") || "").trim() || null;
  const isGlobalTemplate = form.get("isGlobalTemplate") === "on" || !propertyId;
  if (propertyId) {
    const property = await prisma.property.findFirst({ where: { id: propertyId, ...portalWhere(user) } });
    if (!property) return NextResponse.json({ error: "Immobilie gehoert nicht zu dieser Instanz." }, { status: 403 });
  }
  const data: { name: string; propertyId: string | null; isGlobalTemplate: boolean; filename?: string; storagePath?: string; mimeType?: string; size?: number } = { name, propertyId, isGlobalTemplate };
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

  return NextResponse.json(await prisma.contractTemplate.update({ where: { id: template.id }, data }));
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
