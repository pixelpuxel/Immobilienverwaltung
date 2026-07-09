import { AuditAction, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { clientIp, hashPassword } from "@/lib/auth";
import { integrationError, requireIntegrationUser } from "@/lib/integration-auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  name: z.string().trim().optional(),
  username: z.string().trim().optional(),
  email: z.string().trim().optional(),
  password: z.string().min(8).default("BitteSofortAendern123!"),
  role: z.enum(["ADMIN", "BROKER", "TAX_ADVISOR"]).default("BROKER")
});

export async function GET(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request);
  if (!user) return response;
  const forbidden = requireAdmin(user);
  if (forbidden) return forbidden;

  const users = await prisma.user.findMany({
    where: portalWhere(user),
    orderBy: { createdAt: "desc" },
    include: {
      brokerLinks: { where: { status: "active" }, include: { property: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } },
      tenantProfile: { include: { unit: { include: { property: { select: { id: true, name: true } } } } } }
    }
  });

  return NextResponse.json({ items: users.map(safeUser), nextCursor: null });
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["write:settings"]);
  if (!user) return response;
  const forbidden = requireAdmin(user);
  if (forbidden) return forbidden;

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return integrationError("BAD_REQUEST", "Bitte Name, Login und Passwort pruefen.", 400);
  }
  const identity = accountIdentity(parsed.data.email, parsed.data.username);
  if (!identity) {
    return integrationError("BAD_REQUEST", "Bitte E-Mail oder Benutzername angeben.", 400);
  }

  const existing = await prisma.user.findFirst({ where: { OR: [{ email: identity.email }, ...(identity.username ? [{ username: identity.username }] : [])] } });
  if (existing) {
    return integrationError("BAD_REQUEST", "E-Mail oder Benutzername ist bereits vergeben.", 400);
  }

  const created = await prisma.user.create({
    data: {
      email: identity.email,
      username: identity.username,
      portalInstanceId: user.portalInstanceId,
      name: parsed.data.name || roleLabel(parsed.data.role),
      role: parsed.data.role,
      active: true,
      passwordHash: await hashPassword(parsed.data.password)
    },
    include: {
      brokerLinks: { where: { status: "active" }, include: { property: { select: { id: true, name: true } } } },
      tenantProfile: { include: { unit: { include: { property: { select: { id: true, name: true } } } } } }
    }
  });

  await auditLog({
    userId: user.id,
    action: AuditAction.USER_INVITED,
    entity: "User",
    entityId: created.id,
    ipAddress: clientIp(request),
    detail: { role: created.role, createdFrom: "integration" }
  });

  return NextResponse.json(safeUser(created), { status: 201 });
}

function requireAdmin(user: { role: Role }) {
  if (user.role !== Role.ADMIN) {
    return integrationError("FORBIDDEN", "Dieser Endpunkt braucht einen Eigentuemer-Token.", 403);
  }
  return null;
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

function roleLabel(role: Role | string) {
  if (role === Role.ADMIN || role === "ADMIN") return "Eigentuemer";
  if (role === Role.TAX_ADVISOR || role === "TAX_ADVISOR") return "Steuerberater";
  return "Makler";
}

function safeUser(user: {
  id: string;
  email: string;
  username: string | null;
  name: string | null;
  role: Role;
  active: boolean;
  contactPerson: string | null;
  contactAddress: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
  brokerLinks?: { property: { id: string; name: string } }[];
  tenantProfile?: { id: string; isCurrent: boolean; moveInDate: Date | null; moveOutDate: Date | null; unit: { id: string; unitNumber: string; property: { id: string; name: string } } | null } | null;
}) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    name: user.name,
    role: user.role,
    active: user.active,
    contactPerson: user.contactPerson,
    contactAddress: user.contactAddress,
    contactPhone: user.contactPhone,
    contactEmail: user.contactEmail,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    brokerProperties: user.brokerLinks?.map((link) => link.property) || [],
    tenantProfile: user.tenantProfile ? {
      id: user.tenantProfile.id,
      isCurrent: user.tenantProfile.isCurrent,
      moveInDate: user.tenantProfile.moveInDate,
      moveOutDate: user.tenantProfile.moveOutDate,
      unit: user.tenantProfile.unit ? {
        id: user.tenantProfile.unit.id,
        unitNumber: user.tenantProfile.unit.unitNumber,
        property: user.tenantProfile.unit.property
      } : null
    } : null
  };
}
