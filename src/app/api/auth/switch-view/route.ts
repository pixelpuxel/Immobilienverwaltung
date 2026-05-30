import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, createSessionToken, readSessionToken, SESSION_COOKIE, setSessionCookie } from "@/lib/auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  userId: z.string().optional(),
  instanceSwitch: z.boolean().optional().default(false)
});

async function sessionContext(request: NextRequest) {
  const session = readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return null;

  const actor = await prisma.user.findFirst({ where: { id: session.userId, active: true } });
  if (!actor) return null;

  const adminId = session.impersonatedByAdminId || (actor.role === Role.ADMIN ? actor.id : null);
  if (!adminId) return null;

  const admin = await prisma.user.findFirst({ where: { id: adminId, role: Role.ADMIN, active: true } });
  return admin ? { actor, admin, isImpersonating: Boolean(session.impersonatedByAdminId && session.impersonatedByAdminId !== actor.id) } : null;
}

export async function GET(request: NextRequest) {
  const context = await sessionContext(request);
  if (!context) return NextResponse.json({ error: "Nur Eigentümer koennen die Ansicht wechseln." }, { status: 403 });
  const { actor, admin, isImpersonating } = context;
  const userScope = isImpersonating
    ? { OR: [{ ...portalWhere(actor) }, { id: admin.id }] }
    : portalWhere(admin);

  const users = await prisma.user.findMany({
    where: { active: true, ...userScope },
    select: {
      id: true,
      email: true,
      username: true,
      name: true,
      role: true,
      brokerLinks: {
        where: { status: "active" },
        select: { property: { select: { name: true } } },
        orderBy: { createdAt: "desc" }
      },
      tenantProfile: {
        select: {
          firstName: true,
          lastName: true,
          unit: {
            select: {
              unitNumber: true,
              property: { select: { name: true } }
            }
          }
        }
      }
    },
    orderBy: [{ role: "asc" }, { email: "asc" }]
  });

  return NextResponse.json({
    adminId: admin.id,
    users: users.map((user) => ({
      id: user.id,
      email: user.email,
      username: user.username,
      name: user.role === Role.TENANT && user.tenantProfile
        ? `${user.tenantProfile.firstName} ${user.tenantProfile.lastName}`.trim() || user.name
        : user.name,
      role: user.role,
      context: user.role === Role.BROKER
        ? user.brokerLinks.map((link) => link.property.name).join(", ")
        : user.role === Role.TENANT && user.tenantProfile?.unit
          ? `${user.tenantProfile.unit.property.name} / ${user.tenantProfile.unit.unitNumber}`
          : ""
    }))
  });
}

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) {
    return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  }

  const context = await sessionContext(request);
  if (!context) return NextResponse.json({ error: "Nur Eigentümer koennen die Ansicht wechseln." }, { status: 403 });
  const { actor, admin, isImpersonating } = context;

  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Ungueltige Ansicht." }, { status: 400 });
  const currentPortalId = actor.portalInstanceId || admin.portalInstanceId;
  const targetScope = isImpersonating
    ? { OR: [{ ...portalWhere(actor) }, { id: admin.id }] }
    : portalWhere(admin);

  const target = body.data.userId
    ? admin.platformAdmin && !isImpersonating && body.data.instanceSwitch
      ? await prisma.user.findFirst({ where: { id: body.data.userId, active: true } })
      : await prisma.user.findFirst({ where: { id: body.data.userId, active: true, ...targetScope } })
    : admin;

  if (!target) {
    return NextResponse.json({ error: "Benutzer wurde nicht gefunden." }, { status: 404 });
  }
  if (body.data.instanceSwitch) {
    if (!admin.platformAdmin || isImpersonating || target.role !== Role.ADMIN) {
      return NextResponse.json({ error: "Instanzen koennen nur ueber Einstellungen gewechselt werden." }, { status: 403 });
    }
  } else if (target.portalInstanceId !== currentPortalId && target.id !== admin.id) {
    return NextResponse.json({ error: "Der Benutzer-Wechsler bleibt innerhalb der aktuellen Instanz." }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true, role: target.role, email: target.email });
  setSessionCookie(response, createSessionToken(target, target.id === admin.id ? undefined : { impersonatedByAdminId: admin.id }));
  return response;
}
