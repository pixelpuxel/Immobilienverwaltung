import { Role, type User } from "@prisma/client";
import { prisma } from "./prisma";

export async function canAccessDocument(user: Pick<User, "id" | "role">, documentId: string, download = false) {
  if (user.role === Role.ADMIN) return true;
  if (user.role === Role.TENANT) {
    const profile = await prisma.tenantProfile.findUnique({ where: { userId: user.id } });
    const document = await prisma.document.findUnique({ where: { id: documentId } });
    if (profile?.unitId && document?.unitId === profile.unitId && !download) return true;
  }
  const permission = await prisma.accessPermission.findUnique({
    where: { userId_documentId: { userId: user.id, documentId } }
  });
  return Boolean(permission?.canView && (!download || permission.canDownload));
}

export async function brokerPropertyIds(userId: string) {
  const links = await prisma.brokerRequest.findMany({ where: { userId, status: "active" } });
  return links.map((link) => link.propertyId);
}

export async function tenantUnitId(userId: string) {
  const profile = await prisma.tenantProfile.findUnique({ where: { userId } });
  return profile?.unitId || null;
}
