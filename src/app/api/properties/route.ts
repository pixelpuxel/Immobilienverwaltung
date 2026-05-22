import { AuditAction, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auditLog } from "@/lib/audit";
import { assertSameOrigin, clientIp, requireApiUser } from "@/lib/auth";
import { brokerPropertyIds } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { propertySchema } from "@/lib/property-schema";

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

  if (user.role === Role.BROKER) {
    const ids = await brokerPropertyIds(user.id);
    const data = await prisma.property.findMany({ where: { id: { in: ids } }, include: { units: true } });
    return NextResponse.json(data);
  }

  if (user.role === Role.TENANT) {
    const profile = await prisma.tenantProfile.findUnique({ where: { userId: user.id }, include: { unit: { include: { property: true } } } });
    return NextResponse.json(profile?.unit?.property ? [profile.unit.property] : []);
  }

  return NextResponse.json(await prisma.property.findMany({ include: { units: true, documents: true } }));
}

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const body = propertySchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Ungueltige Daten.", issues: body.error.issues }, { status: 400 });
  const property = await prisma.property.create({ data: body.data });
  await auditLog({ userId: user.id, action: AuditAction.PROPERTY_CHANGED, entity: "Property", entityId: property.id, ipAddress: clientIp(request) });
  return NextResponse.json(property, { status: 201 });
}
