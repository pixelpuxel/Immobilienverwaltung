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
          isCurrent: true,
          moveInDate: true,
          moveOutDate: true,
          unit: {
            select: {
              unitNumber: true,
              property: { select: { id: true, name: true } }
            }
          }
        }
      }
    },
    orderBy: [{ role: "asc" }, { email: "asc" }]
  });
  const sortedUsers = users.sort((left, right) => compareSwitchUsers(left, right));

  return NextResponse.json({
    adminId: admin.id,
    users: sortedUsers.map((user) => {
      const propertyName = user.tenantProfile?.unit?.property.name || "Ohne Immobilie";
      const unitNumber = user.tenantProfile?.unit?.unitNumber || "";
      return {
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
          : "",
      group: user.role === Role.ADMIN
        ? "Eigentümer"
        : user.role === Role.BROKER
          ? "Makler"
          : `${user.tenantProfile?.isCurrent ? "Aktuelle Mieter" : "Ehemalige Mieter"} - ${propertyName}`,
      isCurrent: user.tenantProfile?.isCurrent ?? null,
      sortLabel: `${propertyName} ${unitNumber} ${user.tenantProfile?.lastName || ""} ${user.tenantProfile?.firstName || ""}`
    };
    })
  });
}

function compareSwitchUsers(
  left: {
    role: Role;
    email: string;
    name: string | null;
    tenantProfile: null | {
      firstName: string;
      lastName: string;
      isCurrent: boolean;
      moveInDate: Date | null;
      unit: null | { unitNumber: string; property: { name: string } };
    };
  },
  right: {
    role: Role;
    email: string;
    name: string | null;
    tenantProfile: null | {
      firstName: string;
      lastName: string;
      isCurrent: boolean;
      moveInDate: Date | null;
      unit: null | { unitNumber: string; property: { name: string } };
    };
  }
) {
  const roleOrder = (role: Role) => role === Role.ADMIN ? 0 : role === Role.BROKER ? 1 : 2;
  const byRole = roleOrder(left.role) - roleOrder(right.role);
  if (byRole !== 0) return byRole;
  if (left.role === Role.TENANT && right.role === Role.TENANT) {
    const byCurrent = Number(right.tenantProfile?.isCurrent || false) - Number(left.tenantProfile?.isCurrent || false);
    if (byCurrent !== 0) return byCurrent;
    const leftProperty = left.tenantProfile?.unit?.property.name || "";
    const rightProperty = right.tenantProfile?.unit?.property.name || "";
    const byProperty = leftProperty.localeCompare(rightProperty, "de", { sensitivity: "base" });
    if (byProperty !== 0) return byProperty;
    const byUnit = (left.tenantProfile?.unit?.unitNumber || "").localeCompare(right.tenantProfile?.unit?.unitNumber || "", "de", { numeric: true, sensitivity: "base" });
    if (byUnit !== 0) return byUnit;
    const byMoveIn = Number(right.tenantProfile?.moveInDate || 0) - Number(left.tenantProfile?.moveInDate || 0);
    if (byMoveIn !== 0) return byMoveIn;
    return `${left.tenantProfile?.lastName || ""} ${left.tenantProfile?.firstName || ""}`.localeCompare(`${right.tenantProfile?.lastName || ""} ${right.tenantProfile?.firstName || ""}`, "de", { sensitivity: "base" });
  }
  return (left.name || left.email).localeCompare(right.name || right.email, "de", { sensitivity: "base" });
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
