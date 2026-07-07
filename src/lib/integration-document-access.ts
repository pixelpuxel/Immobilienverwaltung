import { DocumentScope, Role, type Prisma } from "@prisma/client";
import { brokerPropertyIds, brokerVisibleDocumentWhere, tenantUnitId } from "@/lib/permissions";
import { portalWhere } from "@/lib/portal-instance";

type IntegrationUserLike = {
  id: string;
  role: Role;
  portalInstanceId: string | null;
};

export async function integrationDocumentVisibilityWhere(user: IntegrationUserLike): Promise<Prisma.DocumentWhereInput> {
  if (user.role === Role.ADMIN) return portalWhere(user);
  if (user.role === Role.BROKER) return { ...portalWhere(user), ...brokerVisibleDocumentWhere(user.id, await brokerPropertyIds(user.id)) };
  if (user.role === Role.TAX_ADVISOR) return { ...portalWhere(user), permissions: { some: { userId: user.id, canView: true } } };
  const unitId = await tenantUnitId(user.id);
  return {
    ...portalWhere(user),
    OR: [
      { permissions: { some: { userId: user.id, canView: true } } },
      { tenantProfile: { userId: user.id } },
      { unitId, category: { visibleToTenant: true }, scope: { in: [DocumentScope.UNIT, DocumentScope.CONTRACT] } }
    ]
  };
}

export async function integrationTenantAccessWhere(user: IntegrationUserLike): Promise<Prisma.TenantProfileWhereInput> {
  if (user.role === Role.ADMIN) return { user: portalWhere(user) };
  if (user.role === Role.BROKER) return { isCurrent: true, unit: { propertyId: { in: await brokerPropertyIds(user.id) } } };
  return { userId: user.id };
}

export function tenantPersonalDocumentWhere(tenant: { id: string; userId: string }): Prisma.DocumentWhereInput {
  return {
    OR: [
      { tenantProfileId: tenant.id },
      { permissions: { some: { userId: tenant.userId, canView: true } } }
    ]
  };
}

export function integrationDocumentInclude() {
  return {
    property: { select: { id: true, name: true } },
    unit: { include: { property: { select: { id: true, name: true } } } },
    tenantProfile: { select: { id: true, firstName: true, lastName: true, email: true, userId: true } },
    category: true
  } satisfies Prisma.DocumentInclude;
}
