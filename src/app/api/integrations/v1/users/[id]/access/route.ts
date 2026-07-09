import { AuditAction, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { clientIp } from "@/lib/auth";
import { integrationError, requireIntegrationUser } from "@/lib/integration-auth";
import { canAccessPortalUser, portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  propertyIds: z.array(z.string()).default([])
});

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["write:settings"]);
  if (!user) return response;
  if (user.role !== Role.ADMIN) return integrationError("FORBIDDEN", "Dieser Endpunkt braucht einen Eigentuemer-Token.", 403);

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return integrationError("NOT_FOUND", "Benutzer wurde nicht gefunden.", 404);
  if (!canAccessPortalUser(user, target)) return integrationError("FORBIDDEN", "Benutzer gehoert nicht zu dieser Instanz.", 403);
  if (target.role !== Role.BROKER) return integrationError("BAD_REQUEST", "Maklerfreigaben koennen nur fuer Makler geaendert werden.", 400);

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return integrationError("BAD_REQUEST", "Ungueltige Freigabe-Daten.", 400);

  const propertyIds = [...new Set(parsed.data.propertyIds)];
  const allowedPropertyCount = await prisma.property.count({ where: { id: { in: propertyIds }, ...portalWhere(user) } });
  if (allowedPropertyCount !== propertyIds.length) return integrationError("FORBIDDEN", "Mindestens eine Immobilie gehoert nicht zu dieser Instanz.", 403);

  const currentLinks = await prisma.brokerRequest.findMany({ where: { userId: target.id } });
  const removedPropertyIds = currentLinks.map((link) => link.propertyId).filter((propertyId) => !propertyIds.includes(propertyId));

  await prisma.brokerRequest.deleteMany({ where: { userId: target.id, propertyId: { notIn: propertyIds.length ? propertyIds : [""] } } });

  for (const propertyId of propertyIds) {
    await prisma.brokerRequest.upsert({
      where: { userId_propertyId: { userId: target.id, propertyId } },
      update: { status: "active" },
      create: { userId: target.id, propertyId, status: "active" }
    });
  }

  if (removedPropertyIds.length) {
    const removedDocuments = await prisma.document.findMany({ where: { propertyId: { in: removedPropertyIds }, ...portalWhere(user) }, select: { id: true } });
    await prisma.accessPermission.deleteMany({
      where: { userId: target.id, documentId: { in: removedDocuments.map((document) => document.id) } }
    });
  }

  const documents = await prisma.document.findMany({ where: { propertyId: { in: propertyIds }, ...portalWhere(user) }, select: { id: true } });
  for (const document of documents) {
    await prisma.accessPermission.upsert({
      where: { userId_documentId: { userId: target.id, documentId: document.id } },
      update: { canView: true, canDownload: true },
      create: { userId: target.id, documentId: document.id, canView: true, canDownload: true }
    });
  }

  await auditLog({
    userId: user.id,
    action: AuditAction.PERMISSION_CHANGED,
    entity: "User",
    entityId: target.id,
    ipAddress: clientIp(request),
    detail: { role: target.role, propertyIds }
  });

  const updated = await prisma.user.findUniqueOrThrow({
    where: { id: target.id },
    include: {
      brokerLinks: { where: { status: "active" }, include: { property: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } },
      tenantProfile: { include: { unit: { include: { property: { select: { id: true, name: true } } } } } }
    }
  });

  return NextResponse.json(safeUser(updated));
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
