import { AuditAction, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { assertSameOrigin, clientIp, hashPassword, requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  propertyId: z.string().optional(),
  propertyIds: z.array(z.string()).optional(),
  password: z.string().min(8).default("BitteSofortAendern123!"),
  message: z.string().optional()
});

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  return NextResponse.json(await prisma.brokerRequest.findMany({ include: { user: true, property: true } }));
}

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const admin = await requireApiUser(request, [Role.ADMIN]);
  if (!admin) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Ungueltige Daten." }, { status: 400 });
  const propertyIds = [...new Set(body.data.propertyIds?.length ? body.data.propertyIds : body.data.propertyId ? [body.data.propertyId] : [])];
  if (!propertyIds.length) return NextResponse.json({ error: "Bitte mindestens eine Immobilie auswaehlen." }, { status: 400 });
  const user = await prisma.user.upsert({
    where: { email: body.data.email },
    update: { name: body.data.name, role: Role.BROKER, active: true },
    create: {
      email: body.data.email,
      name: body.data.name,
      role: Role.BROKER,
      active: true,
      passwordHash: await hashPassword(body.data.password)
    }
  });
  const links = [];
  for (const propertyId of propertyIds) {
    links.push(await prisma.brokerRequest.upsert({
      where: { userId_propertyId: { userId: user.id, propertyId } },
      update: { status: "active", message: body.data.message },
      create: { userId: user.id, propertyId, message: body.data.message }
    }));
  }

  const documents = await prisma.document.findMany({ where: { propertyId: { in: propertyIds } }, select: { id: true } });
  for (const document of documents) {
    await prisma.accessPermission.upsert({
      where: { userId_documentId: { userId: user.id, documentId: document.id } },
      update: { canView: true, canDownload: true },
      create: { userId: user.id, documentId: document.id, canView: true, canDownload: true }
    });
  }

  await auditLog({ userId: admin.id, action: AuditAction.USER_INVITED, entity: "User", entityId: user.id, ipAddress: clientIp(request), detail: { propertyIds } });
  return NextResponse.json({ user, links }, { status: 201 });
}
