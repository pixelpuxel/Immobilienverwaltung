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
  const terms = searchTerms(q);
  const brokerIds = user.role === Role.BROKER ? await brokerPropertyIds(user.id) : [];
  const tenantUnit = user.role === Role.TENANT ? await tenantUnitId(user.id) : null;
  const propertyWhere = propertySearchWhere(user, terms, brokerIds, tenantUnit);
  const unitWhere = unitSearchWhere(user, terms, brokerIds, tenantUnit);
  const documentWhere = documentSearchWhere(user, terms, brokerIds, tenantUnit);
  const tenantWhere = tenantSearchWhere(user, terms, brokerIds, tenantUnit);
  const contractWhere = contractSearchWhere(user, terms, brokerIds, tenantUnit);
  const userWhere = user.role === Role.ADMIN ? userSearchWhere(user, terms) : null;

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
      href: `/properties/${unit.propertyId}#unit-${unit.id}`,
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
      href: document.storagePath ? `/api/documents/${document.id}/preview` : `/documents?documentId=${document.id}`,
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
      href: user.role === Role.ADMIN ? `/users?tenantId=${tenant.id}` : tenant.unitId ? `/properties/${tenant.unit?.propertyId}#unit-${tenant.unitId}` : "/tenant",
      badge: tenant.email
    })),
    ...users.map<SearchResult>((item) => ({
      type: "Benutzer",
      title: item.name || item.username || item.email,
      description: [item.email, item.username, item.role].filter(Boolean).join(" · "),
      href: `/users?userId=${item.id}`,
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
      href: `/api/contracts/${contract.id}/preview`,
      badge: "Mietvertrag"
    }))
  ].slice(0, 80);
}

function propertySearchWhere(user: ScopedUser, terms: string[], brokerIds: string[], tenantUnit: string | null): Prisma.PropertyWhereInput {
  const search: Prisma.PropertyWhereInput = {
    OR: [
      ...containsAny("name", terms),
      ...containsAny("address", terms),
      ...containsAny("street", terms),
      ...containsAny("postalCode", terms),
      ...containsAny("city", terms),
      ...containsAny("objectType", terms),
      ...containsAny("rentalStatus", terms),
      ...containsAny("internalNotes", terms)
    ]
  };
  if (user.role === Role.ADMIN) return { ...portalWhere(user), ...search };
  if (user.role === Role.BROKER) return { id: { in: brokerIds }, ...search };
  return { units: { some: { id: tenantUnit || "" } }, ...search };
}

function unitSearchWhere(user: ScopedUser, terms: string[], brokerIds: string[], tenantUnit: string | null): Prisma.UnitWhereInput {
  const search: Prisma.UnitWhereInput = {
    OR: [...containsAny("unitNumber", terms), ...containsAny("floor", terms), ...containsAny("status", terms)]
  };
  if (user.role === Role.ADMIN) return { property: portalWhere(user), ...search };
  if (user.role === Role.BROKER) return { propertyId: { in: brokerIds }, ...search };
  return { id: tenantUnit || "", ...search };
}

function documentSearchWhere(user: ScopedUser, terms: string[], brokerIds: string[], tenantUnit: string | null): Prisma.DocumentWhereInput {
  const search: Prisma.DocumentWhereInput = {
    OR: [
      ...containsAny("title", terms),
      ...containsAny("filename", terms),
      ...containsAny("summary", terms),
      { tags: { hasSome: terms } },
      { category: { OR: [...containsAny("name", terms), ...containsAny("group", terms)] } }
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

function tenantSearchWhere(user: ScopedUser, terms: string[], brokerIds: string[], tenantUnit: string | null): Prisma.TenantProfileWhereInput {
  const search: Prisma.TenantProfileWhereInput = {
    OR: [
      ...containsAny("firstName", terms),
      ...containsAny("lastName", terms),
      ...containsAny("email", terms),
      ...containsAny("phone", terms),
      ...containsAny("currentAddress", terms),
      ...containsAny("roomDescription", terms)
    ]
  };
  if (user.role === Role.ADMIN) return { user: portalWhere(user), ...search };
  if (user.role === Role.BROKER) return { isCurrent: true, unit: { propertyId: { in: brokerIds } }, ...search };
  return { userId: user.id, ...search };
}

function contractSearchWhere(user: ScopedUser, terms: string[], brokerIds: string[], tenantUnit: string | null): Prisma.LeaseContractWhereInput {
  const search: Prisma.LeaseContractWhereInput = {
    OR: [
      { tenantProfile: { OR: [...containsAny("firstName", terms), ...containsAny("lastName", terms), ...containsAny("email", terms)] } },
      { unit: { OR: [...containsAny("unitNumber", terms), { property: { OR: [...containsAny("name", terms), ...containsAny("address", terms)] } }] } },
      { template: { OR: containsAny("name", terms) } }
    ]
  };
  if (user.role === Role.ADMIN) return { unit: { property: portalWhere(user) }, ...search };
  if (user.role === Role.BROKER) return { unit: { propertyId: { in: brokerIds } }, ...search };
  return { tenantProfile: { userId: user.id }, ...search };
}

function userSearchWhere(user: ScopedUser, terms: string[]): Prisma.UserWhereInput {
  return {
    ...portalWhere(user),
    OR: [
      ...containsAny("email", terms),
      ...containsAny("username", terms),
      ...containsAny("name", terms),
      ...containsAny("contactPerson", terms),
      ...containsAny("contactPhone", terms),
      ...containsAny("contactEmail", terms)
    ]
  };
}

function contains(field: string, q: string) {
  return { [field]: { contains: q, mode: "insensitive" as const } };
}

function containsAny(field: string, terms: string[]) {
  return terms.map((term) => contains(field, term));
}

function searchTerms(query: string) {
  return [...new Set([query, ...dateVariants(query)].map((term) => term.trim()).filter((term) => term.length >= 2))];
}

function dateVariants(query: string) {
  const match = query.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/);
  if (!match) return [];
  const day = Number(match[1]);
  const month = Number(match[2]);
  const yearInput = match[3];
  if (day < 1 || day > 31 || month < 1 || month > 12) return [];
  const fullYear = yearInput.length === 2 ? Number(`20${yearInput}`) : Number(yearInput);
  if (fullYear < 1900 || fullYear > 2099) return [];
  const shortYear = String(fullYear).slice(-2);
  const dayPlain = String(day);
  const monthPlain = String(month);
  const dayPadded = dayPlain.padStart(2, "0");
  const monthPadded = monthPlain.padStart(2, "0");
  return [
    `${dayPlain}.${monthPlain}.${shortYear}`,
    `${dayPadded}.${monthPadded}.${shortYear}`,
    `${dayPlain}.${monthPlain}.${fullYear}`,
    `${dayPadded}.${monthPadded}.${fullYear}`
  ];
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("de-DE").format(value);
}
