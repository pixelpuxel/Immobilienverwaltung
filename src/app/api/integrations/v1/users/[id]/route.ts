import { AuditAction, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { clientIp, hashPassword } from "@/lib/auth";
import { integrationError, requireIntegrationUser } from "@/lib/integration-auth";
import { canAccessPortalUser } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  name: z.string().optional(),
  username: z.string().optional(),
  email: z.string().email().optional(),
  role: z.nativeEnum(Role).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional().or(z.literal("")),
  contactPerson: z.string().optional(),
  contactAddress: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal(""))
});

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["write:settings"]);
  if (!user) return response;
  const forbidden = requireAdmin(user);
  if (forbidden) return forbidden;

  const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return integrationError("BAD_REQUEST", "Bitte Eingaben pruefen.", 400);
  }

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return integrationError("NOT_FOUND", "Benutzer wurde nicht gefunden.", 404);
  if (!canAccessPortalUser(user, target)) return integrationError("FORBIDDEN", "Benutzer gehoert nicht zu dieser Instanz.", 403);

  const username = hasField(parsed.data, "username") ? cleanUsername(parsed.data.username) : target.username;
  if (username && username !== target.username) {
    const existing = await prisma.user.findFirst({ where: { username, id: { not: target.id } } });
    if (existing) return integrationError("BAD_REQUEST", "Dieser Benutzername ist bereits vergeben.", 400);
  }
  const email = hasField(parsed.data, "email") ? parsed.data.email?.trim().toLowerCase() : target.email;
  if (email && email !== target.email) {
    const existing = await prisma.user.findFirst({ where: { email, id: { not: target.id } } });
    if (existing) return integrationError("BAD_REQUEST", "Diese E-Mail ist bereits vergeben.", 400);
  }
  if (target.id === user.id && parsed.data.active === false) {
    return integrationError("BAD_REQUEST", "Du kannst dein eigenes Konto nicht sperren.", 400);
  }
  if (target.id === user.id && parsed.data.role && parsed.data.role !== Role.ADMIN) {
    return integrationError("BAD_REQUEST", "Du kannst deine eigene Eigentuemerrolle nicht entfernen.", 400);
  }

  const password = parsed.data.password?.trim();
  const updated = await prisma.user.update({
    where: { id: target.id },
    data: {
      email: email || target.email,
      name: textField(parsed.data, "name", target.name),
      username,
      role: parsed.data.role || target.role,
      active: parsed.data.active ?? target.active,
      ...(password ? { passwordHash: await hashPassword(password) } : {}),
      contactPerson: textField(parsed.data, "contactPerson", target.contactPerson),
      contactAddress: textField(parsed.data, "contactAddress", target.contactAddress),
      contactPhone: textField(parsed.data, "contactPhone", target.contactPhone),
      contactEmail: textField(parsed.data, "contactEmail", target.contactEmail)
    },
    include: {
      brokerLinks: { where: { status: "active" }, include: { property: { select: { id: true, name: true } } } },
      tenantProfile: { include: { unit: { include: { property: { select: { id: true, name: true } } } } } }
    }
  });

  await auditLog({
    userId: user.id,
    action: AuditAction.PERMISSION_CHANGED,
    entity: "User",
    entityId: updated.id,
    ipAddress: clientIp(request),
    detail: { userUpdated: true, passwordChanged: Boolean(password), role: updated.role, active: updated.active }
  });

  return NextResponse.json(safeUser(updated));
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["write:settings"]);
  if (!user) return response;
  const forbidden = requireAdmin(user);
  if (forbidden) return forbidden;
  if (user.id === params.id) {
    return integrationError("BAD_REQUEST", "Du kannst deinen eigenen Eigentuemer-Benutzer nicht loeschen.", 400);
  }

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return integrationError("NOT_FOUND", "Benutzer wurde nicht gefunden.", 404);
  if (!canAccessPortalUser(user, target)) return integrationError("FORBIDDEN", "Benutzer gehoert nicht zu dieser Instanz.", 403);
  if (target.role === Role.ADMIN) {
    return integrationError("BAD_REQUEST", "Eigentuemer-Benutzer koennen hier nicht geloescht werden.", 400);
  }

  await prisma.user.delete({ where: { id: target.id } });
  await auditLog({
    userId: user.id,
    action: AuditAction.PERMISSION_CHANGED,
    entity: "User",
    entityId: target.id,
    ipAddress: clientIp(request),
    detail: { deleted: true, email: target.email, role: target.role }
  });
  return NextResponse.json({ ok: true });
}

function requireAdmin(user: { role: Role }) {
  if (user.role !== Role.ADMIN) {
    return integrationError("FORBIDDEN", "Dieser Endpunkt braucht einen Eigentuemer-Token.", 403);
  }
  return null;
}

function emptyToNull(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function textField<T extends Record<string, unknown>>(data: T, key: keyof T, fallback: string | null) {
  return hasField(data, key) ? emptyToNull(data[key] as string | undefined) : fallback;
}

function hasField<T extends Record<string, unknown>>(data: T, key: keyof T) {
  return Object.prototype.hasOwnProperty.call(data, key);
}

function cleanUsername(value?: string) {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : null;
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
