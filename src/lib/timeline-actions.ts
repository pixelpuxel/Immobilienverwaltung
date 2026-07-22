import { AuditAction, Role, type Prisma } from "@prisma/client";
import { auditLog } from "@/lib/audit";
import { clientIp } from "@/lib/auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";
import { serializeTimelineEvent, timelineInclude, type TimelineUser } from "@/lib/timeline";
import type { NextRequest } from "next/server";

type TimelineData = {
  propertyId?: string | null;
  unitId?: string | null;
  tenantProfileId?: string | null;
  brokerUserId?: string | null;
  eventType?: string;
  title?: string;
  description?: string | null;
  status?: string;
  eventDate?: Date;
  endDate?: Date | null;
  dueDate?: Date | null;
  costAmount?: number | null;
  costCurrency?: string;
  costCategory?: string | null;
  isInternal?: boolean;
  documentIds?: string[];
  metadata?: unknown;
};

export async function createTimelineEvent(user: TimelineUser, data: TimelineData, request?: NextRequest) {
  await assertTimelineWriteAccess(user, data);
  const event = await prisma.timelineEvent.create({
    data: {
      portalInstanceId: user.portalInstanceId,
      propertyId: data.propertyId || null,
      unitId: data.unitId || null,
      tenantProfileId: data.tenantProfileId || null,
      brokerUserId: data.brokerUserId || null,
      actorUserId: user.id,
      eventType: data.eventType || "NOTE",
      title: data.title || "",
      description: data.description || null,
      status: data.status || "INFO",
      eventDate: data.eventDate || new Date(),
      endDate: data.endDate || null,
      dueDate: data.dueDate || null,
      costAmount: data.costAmount ?? null,
      costCurrency: data.costCurrency || "EUR",
      costCategory: data.costCategory || null,
      isInternal: Boolean(data.isInternal),
      metadata: (data.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      documents: data.documentIds?.length ? {
        createMany: {
          data: data.documentIds.map((documentId) => ({ documentId })),
          skipDuplicates: true
        }
      } : undefined
    },
    include: timelineInclude()
  });
  await auditLog({
    userId: user.id,
    action: AuditAction.PROPERTY_CHANGED,
    entity: "TimelineEvent",
    entityId: event.id,
    ipAddress: request ? clientIp(request) : "integration",
    detail: { title: event.title, propertyId: event.propertyId, eventType: event.eventType }
  });
  return serializeTimelineEvent(event);
}

export async function updateTimelineEvent(user: TimelineUser, id: string, data: TimelineData, request?: NextRequest) {
  const existing = await prisma.timelineEvent.findFirst({ where: { id, ...portalWhere(user) }, include: timelineInclude() });
  if (!existing) return null;
  await assertTimelineWriteAccess(user, { ...data, propertyId: data.propertyId ?? existing.propertyId, unitId: data.unitId ?? existing.unitId, tenantProfileId: data.tenantProfileId ?? existing.tenantProfileId, brokerUserId: data.brokerUserId ?? existing.brokerUserId });
  const updated = await prisma.$transaction(async (tx) => {
    if (data.documentIds) {
      await tx.timelineEventDocument.deleteMany({ where: { timelineEventId: id } });
      if (data.documentIds.length) {
        await tx.timelineEventDocument.createMany({
          data: data.documentIds.map((documentId) => ({ timelineEventId: id, documentId })),
          skipDuplicates: true
        });
      }
    }
    return tx.timelineEvent.update({
      where: { id },
      data: {
        propertyId: data.propertyId === undefined ? undefined : data.propertyId,
        unitId: data.unitId === undefined ? undefined : data.unitId,
        tenantProfileId: data.tenantProfileId === undefined ? undefined : data.tenantProfileId,
        brokerUserId: data.brokerUserId === undefined ? undefined : data.brokerUserId,
        eventType: data.eventType,
        title: data.title,
        description: data.description === undefined ? undefined : data.description,
        status: data.status,
        eventDate: data.eventDate,
        endDate: data.endDate === undefined ? undefined : data.endDate,
        dueDate: data.dueDate === undefined ? undefined : data.dueDate,
        costAmount: data.costAmount === undefined ? undefined : data.costAmount,
        costCurrency: data.costCurrency,
        costCategory: data.costCategory === undefined ? undefined : data.costCategory,
        isInternal: data.isInternal,
        metadata: data.metadata === undefined ? undefined : data.metadata as Prisma.InputJsonValue
      },
      include: timelineInclude()
    });
  });
  await auditLog({
    userId: user.id,
    action: AuditAction.PROPERTY_CHANGED,
    entity: "TimelineEvent",
    entityId: id,
    ipAddress: request ? clientIp(request) : "integration",
    detail: { title: updated.title, action: "updated" }
  });
  return serializeTimelineEvent(updated);
}

export async function deleteTimelineEvent(user: TimelineUser, id: string, request?: NextRequest) {
  if (user.role !== Role.ADMIN) return false;
  const existing = await prisma.timelineEvent.findFirst({ where: { id, ...portalWhere(user) } });
  if (!existing) return false;
  await prisma.timelineEvent.delete({ where: { id } });
  await auditLog({
    userId: user.id,
    action: AuditAction.PROPERTY_CHANGED,
    entity: "TimelineEvent",
    entityId: id,
    ipAddress: request ? clientIp(request) : "integration",
    detail: { title: existing.title, action: "deleted" }
  });
  return true;
}

async function assertTimelineWriteAccess(user: TimelineUser, data: TimelineData) {
  if (user.role !== Role.ADMIN) throw new Error("FORBIDDEN");
  if (data.propertyId) {
    const property = await prisma.property.findFirst({ where: { id: data.propertyId, ...portalWhere(user) }, select: { id: true } });
    if (!property) throw new Error("PROPERTY_NOT_FOUND");
  }
  if (data.unitId) {
    const unit = await prisma.unit.findFirst({ where: { id: data.unitId, property: portalWhere(user) }, select: { id: true, propertyId: true } });
    if (!unit) throw new Error("UNIT_NOT_FOUND");
    if (data.propertyId && unit.propertyId !== data.propertyId) throw new Error("UNIT_PROPERTY_MISMATCH");
  }
  if (data.tenantProfileId) {
    const tenant = await prisma.tenantProfile.findFirst({ where: { id: data.tenantProfileId, user: portalWhere(user) }, include: { unit: true } });
    if (!tenant) throw new Error("TENANT_NOT_FOUND");
    if (data.unitId && tenant.unitId !== data.unitId) throw new Error("TENANT_UNIT_MISMATCH");
    if (data.propertyId && tenant.unit?.propertyId !== data.propertyId) throw new Error("TENANT_PROPERTY_MISMATCH");
  }
  if (data.brokerUserId) {
    const broker = await prisma.user.findFirst({ where: { id: data.brokerUserId, role: Role.BROKER, ...portalWhere(user) }, select: { id: true } });
    if (!broker) throw new Error("BROKER_NOT_FOUND");
  }
  if (data.documentIds?.length) {
    const count = await prisma.document.count({
      where: {
        id: { in: data.documentIds },
        ...portalWhere(user)
      }
    });
    if (count !== data.documentIds.length) throw new Error("DOCUMENT_NOT_FOUND");
  }
}
