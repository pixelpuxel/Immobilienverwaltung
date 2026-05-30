import { AuditAction, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { assertSameOrigin, clientIp, hashPassword, requireApiUser } from "@/lib/auth";
import { canAccessPortalUser } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

const ownerProfileSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  username: z.string().optional(),
  role: z.nativeEnum(Role).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional().or(z.literal("")),
  contactPerson: z.string().optional(),
  contactAddress: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  ownerBankName: z.string().optional(),
  ownerIban: z.string().optional(),
  ownerTaxId: z.string().optional(),
  ownerNotes: z.string().optional()
});

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const admin = await requireApiUser(request, [Role.ADMIN]);
  if (!admin) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const body = ownerProfileSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Bitte die Eingaben prüfen.", issues: body.error.issues }, { status: 400 });
  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: "Benutzer wurde nicht gefunden." }, { status: 404 });
  if (!canAccessPortalUser(admin, target)) return NextResponse.json({ error: "Benutzer gehoert nicht zu dieser Instanz." }, { status: 403 });

  const username = hasField(body.data, "username") ? cleanUsername(body.data.username) : target.username;
  if (username && username !== target.username) {
    const existing = await prisma.user.findFirst({ where: { username, id: { not: target.id } } });
    if (existing) return NextResponse.json({ error: "Dieser Benutzername ist bereits vergeben." }, { status: 400 });
  }
  const email = hasField(body.data, "email") ? body.data.email?.trim().toLowerCase() : target.email;
  if (email && email !== target.email) {
    const existing = await prisma.user.findFirst({ where: { email, id: { not: target.id } } });
    if (existing) return NextResponse.json({ error: "Diese E-Mail ist bereits vergeben." }, { status: 400 });
  }
  if (target.id === admin.id && body.data.active === false) {
    return NextResponse.json({ error: "Du kannst dein eigenes Konto nicht sperren." }, { status: 400 });
  }
  if (target.id === admin.id && body.data.role && body.data.role !== Role.ADMIN) {
    return NextResponse.json({ error: "Du kannst deine eigene Eigentümerrolle nicht entfernen." }, { status: 400 });
  }

  const password = body.data.password?.trim();
  const updated = await prisma.user.update({
    where: { id: target.id },
    data: {
      email: email || target.email,
      name: textField(body.data, "name", target.name),
      username,
      role: body.data.role || target.role,
      active: body.data.active ?? target.active,
      ...(password ? { passwordHash: await hashPassword(password) } : {}),
      contactPerson: textField(body.data, "contactPerson", target.contactPerson),
      contactAddress: textField(body.data, "contactAddress", target.contactAddress),
      contactPhone: textField(body.data, "contactPhone", target.contactPhone),
      contactEmail: textField(body.data, "contactEmail", target.contactEmail),
      ownerBankName: textField(body.data, "ownerBankName", target.ownerBankName),
      ownerIban: textField(body.data, "ownerIban", target.ownerIban),
      ownerTaxId: textField(body.data, "ownerTaxId", target.ownerTaxId),
      ownerNotes: textField(body.data, "ownerNotes", target.ownerNotes)
    }
  });
  await auditLog({
    userId: admin.id,
    action: AuditAction.PERMISSION_CHANGED,
    entity: "User",
    entityId: target.id,
    ipAddress: clientIp(request),
    detail: {
      userUpdated: true,
      passwordChanged: Boolean(password),
      email: updated.email,
      role: updated.role,
      active: updated.active
    }
  });
  return NextResponse.json(safeUser(updated));
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const admin = await requireApiUser(request, [Role.ADMIN]);
  if (!admin) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  if (admin.id === params.id) return NextResponse.json({ error: "Du kannst deinen eigenen Eigentümer-Benutzer nicht loeschen." }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: "Benutzer wurde nicht gefunden." }, { status: 404 });
  if (!canAccessPortalUser(admin, target)) return NextResponse.json({ error: "Benutzer gehoert nicht zu dieser Instanz." }, { status: 403 });
  if (target.role === Role.ADMIN) return NextResponse.json({ error: "Eigentümer-Benutzer koennen hier nicht geloescht werden." }, { status: 400 });

  await prisma.user.delete({ where: { id: target.id } });
  await auditLog({
    userId: admin.id,
    action: AuditAction.PERMISSION_CHANGED,
    entity: "User",
    entityId: target.id,
    ipAddress: clientIp(request),
    detail: { deleted: true, email: target.email, role: target.role }
  });
  return NextResponse.json({ ok: true });
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
  contactPerson: string | null;
  contactAddress: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  ownerBankName: string | null;
  ownerIban: string | null;
  ownerTaxId: string | null;
  ownerNotes: string | null;
  role: Role;
  active: boolean;
}) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    name: user.name,
    contactPerson: user.contactPerson,
    contactAddress: user.contactAddress,
    contactPhone: user.contactPhone,
    contactEmail: user.contactEmail,
    ownerBankName: user.ownerBankName,
    ownerIban: user.ownerIban,
    ownerTaxId: user.ownerTaxId,
    ownerNotes: user.ownerNotes,
    role: user.role,
    active: user.active
  };
}
