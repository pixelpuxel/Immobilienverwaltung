import { AuditAction, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { assertSameOrigin, clientIp, hashPassword, requireApiUser } from "@/lib/auth";
import { sendWelcomeMail } from "@/lib/mail";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  email: z.string().email().optional().or(z.literal("")),
  username: z.string().optional(),
  name: z.string().optional(),
  propertyId: z.string().optional(),
  propertyIds: z.array(z.string()).optional(),
  password: z.string().min(8).default("BitteSofortAendern123!"),
  message: z.string().optional()
});

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  return NextResponse.json(await prisma.brokerRequest.findMany({ where: { property: portalWhere(user) }, include: { user: true, property: true } }));
}

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const admin = await requireApiUser(request, [Role.ADMIN]);
  if (!admin) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Ungueltige Daten." }, { status: 400 });
  const identity = accountIdentity(body.data.email, body.data.username);
  if (!identity) return NextResponse.json({ error: "Bitte E-Mail oder Benutzername angeben." }, { status: 400 });
  const existingUser = await prisma.user.findFirst({ where: { OR: [{ email: identity.email }, ...(identity.username ? [{ username: identity.username }] : [])] } });
  if (existingUser?.portalInstanceId && existingUser.portalInstanceId !== admin.portalInstanceId) {
    return NextResponse.json({ error: "Diese Zugangsdaten werden bereits in einer anderen Instanz verwendet." }, { status: 400 });
  }
  const propertyIds = [...new Set(body.data.propertyIds?.length ? body.data.propertyIds : body.data.propertyId ? [body.data.propertyId] : [])];
  if (!propertyIds.length) return NextResponse.json({ error: "Bitte mindestens eine Immobilie auswaehlen." }, { status: 400 });
  const allowedPropertyCount = await prisma.property.count({ where: { id: { in: propertyIds }, ...portalWhere(admin) } });
  if (allowedPropertyCount !== propertyIds.length) return NextResponse.json({ error: "Mindestens eine Immobilie gehoert nicht zu dieser Instanz." }, { status: 403 });
  const properties = await prisma.property.findMany({ where: { id: { in: propertyIds }, ...portalWhere(admin) }, select: { name: true } });
  const user = existingUser
    ? await prisma.user.update({ where: { id: existingUser.id }, data: { portalInstanceId: admin.portalInstanceId, username: identity.username, name: body.data.name, role: Role.BROKER, active: true } })
    : await prisma.user.create({
      data: {
        email: identity.email,
        portalInstanceId: admin.portalInstanceId,
        username: identity.username,
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

  const documents = await prisma.document.findMany({ where: { propertyId: { in: propertyIds }, ...portalWhere(admin) }, select: { id: true } });
  for (const document of documents) {
    await prisma.accessPermission.upsert({
      where: { userId_documentId: { userId: user.id, documentId: document.id } },
      update: { canView: true, canDownload: true },
      create: { userId: user.id, documentId: document.id, canView: true, canDownload: true }
    });
  }

  await auditLog({ userId: admin.id, action: AuditAction.USER_INVITED, entity: "User", entityId: user.id, ipAddress: clientIp(request), detail: { propertyIds } });
  const mail = await sendWelcomeMail({
    to: user.email,
    name: user.name,
    roleLabel: "Makler",
    identifier: user.username || user.email,
    password: body.data.password,
    portalInstanceId: admin.portalInstanceId,
    context: { properties: properties.map((property) => property.name).join(", ") }
  }).catch((error) => ({ sent: false, reason: error instanceof Error ? error.message : "unknown" }));
  return NextResponse.json({ user: { id: user.id, email: user.email, username: user.username, name: user.name, role: user.role, active: user.active }, links, mail }, { status: 201 });
}

function accountIdentity(email?: string, username?: string) {
  const normalizedEmail = email?.trim().toLowerCase();
  const normalizedUsername = username?.trim().toLowerCase();
  if (!normalizedEmail && !normalizedUsername) return null;
  return {
    email: normalizedEmail || `${normalizedUsername}@portal.local`,
    username: normalizedUsername || null
  };
}
