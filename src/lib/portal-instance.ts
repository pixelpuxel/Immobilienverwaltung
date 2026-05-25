import { Role, type User } from "@prisma/client";
import { prisma } from "./prisma";

export type ScopedUser = Pick<User, "id" | "role" | "portalInstanceId" | "platformAdmin">;

export function portalWhere(user: Pick<User, "portalInstanceId">) {
  return user.portalInstanceId ? { portalInstanceId: user.portalInstanceId } : {};
}

export async function assertPropertyInPortal(propertyId: string | null | undefined, user: Pick<User, "portalInstanceId">) {
  if (!propertyId || !user.portalInstanceId) return true;
  const count = await prisma.property.count({ where: { id: propertyId, portalInstanceId: user.portalInstanceId } });
  return count > 0;
}

export async function assertUnitInPortal(unitId: string | null | undefined, user: Pick<User, "portalInstanceId">) {
  if (!unitId || !user.portalInstanceId) return true;
  const count = await prisma.unit.count({ where: { id: unitId, property: { portalInstanceId: user.portalInstanceId } } });
  return count > 0;
}

export function canAccessPortalUser(actor: ScopedUser, target: Pick<User, "portalInstanceId">) {
  if (actor.platformAdmin) return true;
  return actor.portalInstanceId === target.portalInstanceId;
}

export function shouldScope(user: ScopedUser) {
  return user.role !== Role.ADMIN || !user.platformAdmin;
}
