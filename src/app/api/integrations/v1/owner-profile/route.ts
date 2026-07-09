import { AuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { clientIp } from "@/lib/auth";
import { requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { prisma } from "@/lib/prisma";

const ownerProfileSchema = z.object({
  name: z.string().optional(),
  contactPerson: z.string().optional(),
  contactAddress: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  ownerBankName: z.string().optional(),
  ownerIban: z.string().optional(),
  ownerTaxId: z.string().optional(),
  ownerNotes: z.string().optional()
});

export async function GET(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request);
  if (!user) return response;

  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;

  const owner = await prisma.user.findUnique({ where: { id: user.id } });
  if (!owner) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Eigentümerprofil nicht gefunden." } }, { status: 404 });
  return NextResponse.json(serializeOwner(owner));
}

export async function PATCH(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request);
  if (!user) return response;

  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;

  const body = ownerProfileSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Bitte die Eingaben prüfen.", issues: body.error.issues } }, { status: 400 });
  const existing = await prisma.user.findUnique({ where: { id: user.id } });
  if (!existing) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Eigentümerprofil nicht gefunden." } }, { status: 404 });

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      name: textField(body.data, "name", existing.name),
      contactPerson: textField(body.data, "contactPerson", existing.contactPerson),
      contactAddress: textField(body.data, "contactAddress", existing.contactAddress),
      contactPhone: textField(body.data, "contactPhone", existing.contactPhone),
      contactEmail: textField(body.data, "contactEmail", existing.contactEmail),
      ownerBankName: textField(body.data, "ownerBankName", existing.ownerBankName),
      ownerIban: textField(body.data, "ownerIban", existing.ownerIban),
      ownerTaxId: textField(body.data, "ownerTaxId", existing.ownerTaxId),
      ownerNotes: textField(body.data, "ownerNotes", existing.ownerNotes)
    }
  });
  await auditLog({
    userId: user.id,
    action: AuditAction.PERMISSION_CHANGED,
    entity: "User",
    entityId: user.id,
    ipAddress: clientIp(request),
    detail: { ownerProfileUpdated: true }
  });
  return NextResponse.json(serializeOwner(updated));
}

function emptyToNull(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function textField<T extends Record<string, unknown>>(data: T, key: keyof T, fallback: string | null) {
  return Object.prototype.hasOwnProperty.call(data, key) ? emptyToNull(data[key] as string | undefined) : fallback;
}

function serializeOwner(owner: {
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
  ownerSignaturePath?: string | null;
}) {
  return {
    id: owner.id,
    email: owner.email,
    username: owner.username,
    name: owner.name,
    contactPerson: owner.contactPerson,
    contactAddress: owner.contactAddress,
    contactPhone: owner.contactPhone,
    contactEmail: owner.contactEmail,
    ownerBankName: owner.ownerBankName,
    ownerIban: owner.ownerIban,
    ownerTaxId: owner.ownerTaxId,
    ownerNotes: owner.ownerNotes,
    hasOwnerSignature: Boolean(owner.ownerSignaturePath)
  };
}
