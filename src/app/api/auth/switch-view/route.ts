import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, createSessionToken, readSessionToken, SESSION_COOKIE, setSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  userId: z.string().optional()
});

async function adminFromSession(request: NextRequest) {
  const session = readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return null;

  const actor = await prisma.user.findFirst({ where: { id: session.userId, active: true } });
  if (!actor) return null;

  const adminId = actor.role === Role.ADMIN ? actor.id : session.impersonatedByAdminId;
  if (!adminId) return null;

  return prisma.user.findFirst({ where: { id: adminId, role: Role.ADMIN, active: true } });
}

export async function GET(request: NextRequest) {
  const admin = await adminFromSession(request);
  if (!admin) return NextResponse.json({ error: "Nur Admins koennen die Ansicht wechseln." }, { status: 403 });

  const users = await prisma.user.findMany({
    where: { active: true },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      brokerLinks: {
        where: { status: "active" },
        select: { property: { select: { name: true } } },
        orderBy: { createdAt: "desc" }
      },
      tenantProfile: {
        select: {
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
      name: user.name,
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

  const admin = await adminFromSession(request);
  if (!admin) return NextResponse.json({ error: "Nur Admins koennen die Ansicht wechseln." }, { status: 403 });

  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Ungueltige Ansicht." }, { status: 400 });

  const target = body.data.userId
    ? await prisma.user.findFirst({ where: { id: body.data.userId, active: true } })
    : admin;

  if (!target) {
    return NextResponse.json({ error: "Benutzer wurde nicht gefunden." }, { status: 404 });
  }

  const response = NextResponse.json({ ok: true, role: target.role, email: target.email });
  setSessionCookie(response, createSessionToken(target, target.role === Role.ADMIN ? undefined : { impersonatedByAdminId: admin.id }));
  return response;
}
