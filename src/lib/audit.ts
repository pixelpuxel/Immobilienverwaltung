import { AuditAction } from "@prisma/client";
import { prisma } from "./prisma";

export async function auditLog(input: {
  userId?: string | null;
  action: AuditAction;
  entity?: string;
  entityId?: string;
  ipAddress?: string;
  detail?: unknown;
}) {
  await prisma.auditLog.create({
    data: {
      userId: input.userId || null,
      portalInstanceId: input.userId
        ? (await prisma.user.findUnique({ where: { id: input.userId }, select: { portalInstanceId: true } }))?.portalInstanceId ?? null
        : null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      ipAddress: input.ipAddress,
      detail: input.detail === undefined ? undefined : (input.detail as never)
    }
  });
}
