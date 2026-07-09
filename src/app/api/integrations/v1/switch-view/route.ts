import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createPlainApiToken, hashApiToken, integrationError, requireIntegrationUser, type IntegrationUser } from "@/lib/integration-auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

const switchSchema = z.object({
  userId: z.string().optional().nullable()
});

export async function GET(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request);
  if (!user) return response;
  const forbidden = requireAdmin(user);
  if (forbidden) return forbidden;

  const users = await switchableUsers(user);
  return NextResponse.json({
    adminId: user.id,
    users: users.map(formatSwitchUser)
  });
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request);
  if (!user) return response;
  const forbidden = requireAdmin(user);
  if (forbidden) return forbidden;

  const body = switchSchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return integrationError("BAD_REQUEST", "Ungueltige Ansicht.", 400);

  const target = body.data.userId
    ? await prisma.user.findFirst({
        where: { id: body.data.userId, active: true, ...portalWhere(user) }
      })
    : await prisma.user.findFirst({ where: { id: user.id, active: true } });

  if (!target) return integrationError("NOT_FOUND", "Benutzer wurde nicht gefunden.", 404);
  if (target.portalInstanceId !== user.portalInstanceId && target.id !== user.id) {
    return integrationError("FORBIDDEN", "Der Benutzer-Wechsler bleibt innerhalb der aktuellen Instanz.", 403);
  }

  const plainToken = createPlainApiToken();
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
  const apiToken = await prisma.apiToken.create({
    data: {
      userId: target.id,
      portalInstanceId: target.portalInstanceId,
      name: `iOS Ansicht: ${target.name || target.username || target.email}`,
      tokenHash: hashApiToken(plainToken),
      scopes: user.tokenScopes,
      expiresAt
    }
  });

  return NextResponse.json({
    token: plainToken,
    expiresAt,
    user: {
      id: target.id,
      email: target.email,
      username: target.username,
      name: target.name,
      role: target.role,
      portalInstanceId: target.portalInstanceId,
      platformAdmin: target.platformAdmin
    },
    tokenInfo: {
      id: apiToken.id,
      name: apiToken.name,
      scopes: apiToken.scopes
    }
  });
}

function requireAdmin(user: IntegrationUser) {
  if (user.role !== Role.ADMIN) {
    return integrationError("FORBIDDEN", "Nur Eigentuemer koennen die Ansicht wechseln.", 403);
  }
  return null;
}

async function switchableUsers(user: IntegrationUser) {
  const users = await prisma.user.findMany({
    where: { active: true, ...portalWhere(user) },
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
  return users.sort(compareSwitchUsers);
}

function formatSwitchUser(user: Awaited<ReturnType<typeof switchableUsers>>[number]) {
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
        : user.role === Role.TAX_ADVISOR
          ? "Einzelne Dokumentfreigaben"
          : "",
    group: user.role === Role.ADMIN
      ? "Eigentuemer"
      : user.role === Role.BROKER
        ? "Makler"
        : user.role === Role.TAX_ADVISOR
          ? "Steuerberater"
          : `${user.tenantProfile?.isCurrent ? "Aktuelle Mieter" : "Ehemalige Mieter"} - ${propertyName}`,
    isCurrent: user.tenantProfile?.isCurrent ?? null,
    sortLabel: `${propertyName} ${unitNumber} ${user.tenantProfile?.lastName || ""} ${user.tenantProfile?.firstName || ""}`
  };
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
  const roleOrder = (role: Role) => role === Role.ADMIN ? 0 : role === Role.BROKER ? 1 : role === Role.TAX_ADVISOR ? 2 : 3;
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
