import { Role, type Prisma } from "@prisma/client";
import { brokerPropertyIds, brokerVisibleDocumentWhere, tenantUnitId } from "@/lib/permissions";
import { portalWhere, type ScopedUser } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export type SearchResult = {
  type: "Immobilie" | "Einheit" | "Dokument" | "Mieter" | "Benutzer" | "Vertrag";
  title: string;
  description: string;
  href: string;
  badge?: string;
};

export async function globalSearch(user: ScopedUser, query: string) {
  const q = query.trim();
  if (q.length < 2) return [];
  const brokerIds = user.role === Role.BROKER ? await brokerPropertyIds(user.id) : [];
  const tenantUnit = user.role === Role.TENANT ? await tenantUnitId(user.id) : null;
  const propertyWhere = propertySearchWhere(user, q, brokerIds, tenantUnit);
  const unitWhere = unitSearchWhere(user, q, brokerIds, tenantUnit);
  const documentWhere = documentSearchWhere(user, q, brokerIds, tenantUnit);
  const tenantWhere = tenantSearchWhere(user, q, brokerIds, tenantUnit);
  const contractWhere = contractSearchWhere(user, q, brokerIds, tenantUnit);
  const userWhere = user.role === Role.ADMIN ? userSearchWhere(user, q) : null;

  const [properties, units, documents, tenants, users, contracts] = await Promise.all([
    prisma.property.findMany({ where: propertyWhere, orderBy: { updatedAt: "desc" }, take: 12 }),
    prisma.unit.findMany({ where: unitWhere, include: { property: true }, orderBy: { updatedAt: "desc" }, take: 12 }),
    prisma.document.findMany({ where: documentWhere, include: { property: true, unit: { include: { property: true } }, category: true }, orderBy: { updatedAt: "desc" }, take: 20 }),
    prisma.tenantProfile.findMany({ where: tenantWhere, include: { unit: { include: { property: true } }, user: true }, orderBy: { updatedAt: "desc" }, take: 12 }),
    userWhere ? prisma.user.findMany({ where: userWhere, orderBy: { updatedAt: "desc" }, take: 12 }) : [],
    prisma.leaseContract.findMany({ where: contractWhere, include: { tenantProfile: true, unit: { include: { property: true } }, template: true }, orderBy: { createdAt: "desc" }, take: 12 })
  ]);

  return [
    ...properties.map<SearchResult>((property) => ({
      type: "Immobilie",
      title: property.name,
      description: [property.address, property.rentalStatus, property.objectType].filter(Boolean).join(" · "),
      href: user.role === Role.BROKER ? "/broker" : `/properties/${property.id}`,
      badge: property.city || "Objekt"
    })),
    ...units.map<SearchResult>((unit) => ({
      type: "Einheit",
      title: `${unit.property.name} / ${unit.unitNumber}`,
      description: [unit.floor, unit.status, unit.livingArea ? `${unit.livingArea} qm` : null].filter(Boolean).join(" · "),
      href: `/properties/${unit.propertyId}`,
      badge: unit.status || "Einheit"
    })),
    ...documents.map<SearchResult>((document) => ({
      type: "Dokument",
      title: document.title,
      description: [
        document.summary,
        document.category ? `${document.category.group} / ${document.category.name}` : null,
        document.unit ? `${document.unit.property.name} / ${document.unit.unitNumber}` : document.property?.name
      ].filter(Boolean).join(" · "),
      href: "/documents",
      badge: document.tags.slice(0, 3).join(", ") || document.status
    })),
    ...tenants.map<SearchResult>((tenant) => ({
      type: "Mieter",
      title: `${tenant.firstName} ${tenant.lastName}`.trim() || tenant.email,
      description: [
        tenant.unit ? `${tenant.unit.property.name} / ${tenant.unit.unitNumber}` : null,
        tenant.isCurrent ? "laufend" : "beendet",
        tenant.moveInDate ? `Einzug ${formatDate(tenant.moveInDate)}` : null
      ].filter(Boolean).join(" · "),
      href: user.role === Role.ADMIN ? "/users" : tenant.unitId ? `/properties/${tenant.unit?.propertyId}` : "/tenant",
      badge: tenant.email
    })),
    ...users.map<SearchResult>((item) => ({
      type: "Benutzer",
      title: item.name || item.username || item.email,
      description: [item.email, item.username, item.role].filter(Boolean).join(" · "),
      href: "/users",
      badge: item.active ? "aktiv" : "inaktiv"
    })),
    ...contracts.map<SearchResult>((contract) => ({
      type: "Vertrag",
      title: `${contract.tenantProfile.firstName} ${contract.tenantProfile.lastName}`.trim() || "Mietvertrag",
      description: [
        contract.unit.property.name,
        contract.unit.unitNumber,
        contract.template?.name,
        formatDate(contract.createdAt)
      ].filter(Boolean).join(" · "),
      href: "/contracts",
      badge: "Mietvertrag"
    }))
  ].slice(0, 80);
}

function propertySearchWhere(user: ScopedUser, q: string, brokerIds: string[], tenantUnit: string | null): Prisma.PropertyWhereInput {
  const search: Prisma.PropertyWhereInput = {
    OR: [
      contains("name", q),
      contains("address", q),
      contains("street", q),
      contains("postalCode", q),
      contains("city", q),
      contains("objectType", q),
      contains("rentalStatus", q),
      contains("internalNotes", q)
    ]
  };
  if (user.role === Role.ADMIN) return { ...portalWhere(user), ...search };
  if (user.role === Role.BROKER) return { id: { in: brokerIds }, ...search };
  return { units: { some: { id: tenantUnit || "" } }, ...search };
}

function unitSearchWhere(user: ScopedUser, q: string, brokerIds: string[], tenantUnit: string | null): Prisma.UnitWhereInput {
  const search: Prisma.UnitWhereInput = {
    OR: [contains("unitNumber", q), contains("floor", q), contains("status", q)]
  };
  if (user.role === Role.ADMIN) return { property: portalWhere(user), ...search };
  if (user.role === Role.BROKER) return { propertyId: { in: brokerIds }, ...search };
  return { id: tenantUnit || "", ...search };
}

function documentSearchWhere(user: ScopedUser, q: string, brokerIds: string[], tenantUnit: string | null): Prisma.DocumentWhereInput {
  const search: Prisma.DocumentWhereInput = {
    OR: [
      contains("title", q),
      contains("filename", q),
      contains("summary", q),
      { tags: { has: q } },
      { category: { OR: [contains("name", q), contains("group", q)] } }
    ]
  };
  if (user.role === Role.ADMIN) return { ...portalWhere(user), ...search };
  if (user.role === Role.BROKER) {
    return {
      AND: [
        { ...portalWhere(user), ...brokerVisibleDocumentWhere(user.id, brokerIds) },
        search
      ]
    };
  }
  return {
    AND: [
      {
        OR: [
          { unitId: tenantUnit || "", category: { visibleToTenant: true }, scope: { in: ["UNIT", "CONTRACT"] } },
          { permissions: { some: { userId: user.id, canView: true } } }
        ]
      },
      search
    ]
  };
}

function tenantSearchWhere(user: ScopedUser, q: string, brokerIds: string[], tenantUnit: string | null): Prisma.TenantProfileWhereInput {
  const search: Prisma.TenantProfileWhereInput = {
    OR: [contains("firstName", q), contains("lastName", q), contains("email", q), contains("phone", q), contains("currentAddress", q), contains("roomDescription", q)]
  };
  if (user.role === Role.ADMIN) return { user: portalWhere(user), ...search };
  if (user.role === Role.BROKER) return { isCurrent: true, unit: { propertyId: { in: brokerIds } }, ...search };
  return { userId: user.id, ...search };
}

function contractSearchWhere(user: ScopedUser, q: string, brokerIds: string[], tenantUnit: string | null): Prisma.LeaseContractWhereInput {
  const search: Prisma.LeaseContractWhereInput = {
    OR: [
      { tenantProfile: { OR: [contains("firstName", q), contains("lastName", q), contains("email", q)] } },
      { unit: { OR: [contains("unitNumber", q), { property: { OR: [contains("name", q), contains("address", q)] } }] } },
      { template: contains("name", q) }
    ]
  };
  if (user.role === Role.ADMIN) return { unit: { property: portalWhere(user) }, ...search };
  if (user.role === Role.BROKER) return { unit: { propertyId: { in: brokerIds } }, ...search };
  return { tenantProfile: { userId: user.id }, ...search };
}

function userSearchWhere(user: ScopedUser, q: string): Prisma.UserWhereInput {
  return {
    ...portalWhere(user),
    OR: [contains("email", q), contains("username", q), contains("name", q), contains("contactPerson", q), contains("contactPhone", q), contains("contactEmail", q)]
  };
}

function contains(field: string, q: string) {
  return { [field]: { contains: q, mode: "insensitive" as const } };
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("de-DE").format(value);
}
