import { AuditAction, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auditLog } from "@/lib/audit";
import { assertSameOrigin, clientIp, requireApiUser } from "@/lib/auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";
import { propertyUpdateSchema } from "@/lib/property-schema";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireApiUser(request);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const property = await prisma.property.findFirst({ where: { id: params.id, ...portalWhere(user) }, include: { units: true, documents: true } });
  return property ? NextResponse.json(property) : NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const body = propertyUpdateSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Ungueltige Daten.", issues: body.error.issues }, { status: 400 });
  const existing = await prisma.property.findFirst({ where: { id: params.id, ...portalWhere(user) } });
  if (!existing) return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  const property = await prisma.property.update({ where: { id: params.id }, data: body.data });
  await auditLog({ userId: user.id, action: AuditAction.PROPERTY_CHANGED, entity: "Property", entityId: property.id, ipAddress: clientIp(request) });
  return NextResponse.json(property);
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const existing = await prisma.property.findFirst({ where: { id: params.id, ...portalWhere(user) } });
  if (!existing) return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  await prisma.property.delete({ where: { id: params.id } });
  await auditLog({ userId: user.id, action: AuditAction.PROPERTY_CHANGED, entity: "Property", entityId: params.id, ipAddress: clientIp(request), detail: { deleted: true } });
  return NextResponse.json({ ok: true });
}
