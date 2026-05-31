import { AuditAction, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { assertSameOrigin, clientIp, requireApiUser } from "@/lib/auth";
import { assertUnitInPortal, canAccessPortalUser, portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  propertyIds: z.array(z.string()).optional(),
  unitId: z.string().nullable().optional(),
  moveInDate: z.coerce.date().nullable().optional(),
  moveOutDate: z.coerce.date().nullable().optional(),
  isCurrent: z.preprocess((value) => value === true || value === "true" || value === "on", z.boolean()).optional()
});

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!assertSameOrigin(request)) {
    return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  }

  const admin = await requireApiUser(request, [Role.ADMIN]);
  if (!admin) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });

  const target = await prisma.user.findUnique({ where: { id: params.id }, include: { tenantProfile: true } });
  if (!target) return NextResponse.json({ error: "Benutzer wurde nicht gefunden." }, { status: 404 });
  if (!canAccessPortalUser(admin, target)) return NextResponse.json({ error: "Benutzer gehoert nicht zu dieser Instanz." }, { status: 403 });
  if (target.role === Role.ADMIN) return NextResponse.json({ error: "Eigentümer-Rechte werden hier nicht geaendert." }, { status: 400 });

  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Ungueltige Daten.", issues: body.error.issues }, { status: 400 });

  if (target.role === Role.BROKER) {
    const propertyIds = [...new Set(body.data.propertyIds || [])];
    const allowedPropertyCount = await prisma.property.count({ where: { id: { in: propertyIds }, ...portalWhere(admin) } });
    if (allowedPropertyCount !== propertyIds.length) return NextResponse.json({ error: "Mindestens eine Immobilie gehoert nicht zu dieser Instanz." }, { status: 403 });
    const currentLinks = await prisma.brokerRequest.findMany({ where: { userId: target.id } });
    const currentPropertyIds = currentLinks.map((link) => link.propertyId);
    const removedPropertyIds = currentPropertyIds.filter((propertyId) => !propertyIds.includes(propertyId));

    await prisma.brokerRequest.deleteMany({ where: { userId: target.id, propertyId: { notIn: propertyIds.length ? propertyIds : [""] } } });

    for (const propertyId of propertyIds) {
      await prisma.brokerRequest.upsert({
        where: { userId_propertyId: { userId: target.id, propertyId } },
        update: { status: "active" },
        create: { userId: target.id, propertyId, status: "active" }
      });
    }

    if (removedPropertyIds.length) {
      const removedDocuments = await prisma.document.findMany({ where: { propertyId: { in: removedPropertyIds }, ...portalWhere(admin) }, select: { id: true } });
      await prisma.accessPermission.deleteMany({
        where: { userId: target.id, documentId: { in: removedDocuments.map((document) => document.id) } }
      });
    }

    const documents = await prisma.document.findMany({ where: { propertyId: { in: propertyIds }, ...portalWhere(admin) }, select: { id: true } });
    for (const document of documents) {
      await prisma.accessPermission.upsert({
        where: { userId_documentId: { userId: target.id, documentId: document.id } },
        update: { canView: true, canDownload: true },
        create: { userId: target.id, documentId: document.id, canView: true, canDownload: true }
      });
    }

    await auditLog({
      userId: admin.id,
      action: AuditAction.PERMISSION_CHANGED,
      entity: "User",
      entityId: target.id,
      ipAddress: clientIp(request),
      detail: { role: target.role, propertyIds }
    });
    return NextResponse.json({ ok: true, propertyIds });
  }

  if (target.role === Role.TENANT) {
    const unitId = body.data.unitId || null;
    if (!(await assertUnitInPortal(unitId, admin))) return NextResponse.json({ error: "Einheit gehoert nicht zu dieser Instanz." }, { status: 403 });
    const isCurrent = body.data.isCurrent ?? target.tenantProfile?.isCurrent ?? true;
    if (!target.tenantProfile) {
      return NextResponse.json({ error: "Mieterprofil wurde nicht gefunden." }, { status: 404 });
    }
    const profile = await prisma.tenantProfile.update({
      where: { userId: target.id },
      data: {
        unitId,
        moveInDate: body.data.moveInDate,
        moveOutDate: isCurrent ? null : body.data.moveOutDate,
        isCurrent
      }
    });
    if (profile.unitId && profile.isCurrent) {
      const unit = await prisma.unit.findUnique({ where: { id: profile.unitId }, select: { isSharedHousing: true } });
      if (!unit?.isSharedHousing) {
        await prisma.tenantProfile.updateMany({
          where: { unitId: profile.unitId, id: { not: profile.id } },
          data: { isCurrent: false, moveOutDate: profile.moveInDate || new Date() }
        });
      }
    }
    await auditLog({
      userId: admin.id,
      action: AuditAction.PERMISSION_CHANGED,
      entity: "User",
      entityId: target.id,
      ipAddress: clientIp(request),
      detail: { role: target.role, unitId, isCurrent, moveInDate: body.data.moveInDate, moveOutDate: body.data.moveOutDate }
    });
    return NextResponse.json({ ok: true, unitId, isCurrent });
  }

  return NextResponse.json({ error: "Rolle wird nicht unterstuetzt." }, { status: 400 });
}
