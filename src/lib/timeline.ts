import { Prisma, Role, type TimelineEvent, type User } from "@prisma/client";
import { brokerPropertyIds, tenantUnitId } from "@/lib/permissions";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export const TIMELINE_EVENT_TYPES = [
  { value: "NOTE", label: "Notiz", tone: "bg-slate-100 text-slate-800" },
  { value: "MAINTENANCE_REPORTED", label: "Schaden gemeldet", tone: "bg-red-100 text-red-800" },
  { value: "MAINTENANCE_REPAIRED", label: "Reparatur erledigt", tone: "bg-emerald-100 text-emerald-800" },
  { value: "RENOVATION", label: "Renovierung", tone: "bg-blue-100 text-blue-800" },
  { value: "PURCHASE", label: "Kauf", tone: "bg-violet-100 text-violet-800" },
  { value: "TENANT_MOVE_IN", label: "Einzug", tone: "bg-teal-100 text-teal-800" },
  { value: "TENANT_MOVE_OUT", label: "Auszug", tone: "bg-amber-100 text-amber-800" },
  { value: "DEPOSIT_PAID", label: "Kaution bezahlt", tone: "bg-lime-100 text-lime-800" },
  { value: "DEPOSIT_RETURNED", label: "Kaution zurueckgezahlt", tone: "bg-orange-100 text-orange-800" },
  { value: "RENT_PAID", label: "Miete bezahlt", tone: "bg-emerald-100 text-emerald-800" },
  { value: "RENT_PARTIAL", label: "Teilzahlung Miete", tone: "bg-yellow-100 text-yellow-800" },
  { value: "RENT_OPEN", label: "Miete offen", tone: "bg-rose-100 text-rose-800" },
  { value: "DUNNING", label: "Mahnung", tone: "bg-rose-100 text-rose-800" },
  { value: "CONTRACT_CREATED", label: "Mietvertrag", tone: "bg-indigo-100 text-indigo-800" },
  { value: "COST", label: "Kosten", tone: "bg-stone-100 text-stone-800" },
  { value: "HOA_FEE", label: "Hausgeld", tone: "bg-cyan-100 text-cyan-800" },
  { value: "HOA_RECONCILIATION", label: "Hausgeldabrechnung", tone: "bg-sky-100 text-sky-800" },
  { value: "BROKER", label: "Makler", tone: "bg-purple-100 text-purple-800" }
] as const;

export const TIMELINE_STATUS = [
  "INFO",
  "OPEN",
  "IN_PROGRESS",
  "DONE",
  "PAID",
  "PARTIAL",
  "OVERDUE"
] as const;

export type TimelineUser = Pick<User, "id" | "role" | "portalInstanceId" | "platformAdmin">;

export type TimelineFilters = {
  propertyId?: string | null;
  unitId?: string | null;
  tenantProfileId?: string | null;
  includeDerived?: boolean;
  includeInternal?: boolean;
  limit?: number;
};

export type TimelineItem = {
  id: string;
  source: "timeline" | "tenant" | "rentPayment" | "contract";
  eventType: string;
  eventTypeLabel: string;
  status: string;
  title: string;
  description: string | null;
  eventDate: string;
  endDate: string | null;
  dueDate: string | null;
  costAmount: string | null;
  costCurrency: string;
  costCategory: string | null;
  isInternal: boolean;
  property: { id: string; name: string; address?: string | null } | null;
  unit: { id: string; unitNumber: string } | null;
  tenantProfile: { id: string; firstName: string; lastName: string; email: string } | null;
  brokerUser: { id: string; name: string | null; email: string } | null;
  documents: Array<{ id: string; title: string; filename: string; previewUrl: string; downloadUrl: string }>;
  href: string | null;
};

export async function timelineAccessWhere(user: TimelineUser, filters: TimelineFilters = {}): Promise<Prisma.TimelineEventWhereInput> {
  const clauses: Prisma.TimelineEventWhereInput[] = [portalWhere(user)];
  if (filters.propertyId) clauses.push({ propertyId: filters.propertyId });
  if (filters.unitId) clauses.push({ unitId: filters.unitId });
  if (filters.tenantProfileId) clauses.push({ tenantProfileId: filters.tenantProfileId });
  if (!filters.includeInternal || user.role !== Role.ADMIN) clauses.push({ isInternal: false });

  if (user.role === Role.BROKER) {
    const propertyIds = await brokerPropertyIds(user.id);
    clauses.push({ propertyId: { in: propertyIds } });
  }
  if (user.role === Role.TENANT) {
    const unitId = await tenantUnitId(user.id);
    clauses.push({
      OR: [
        { tenantProfile: { userId: user.id } },
        unitId ? { unitId } : {},
        unitId ? { property: { units: { some: { id: unitId } } } } : {}
      ]
    });
  }
  if (user.role !== Role.ADMIN && user.role !== Role.BROKER && user.role !== Role.TENANT) {
    clauses.push({ id: "__no_timeline_access__" });
  }
  return { AND: clauses };
}

export async function listTimelineItems(user: TimelineUser, filters: TimelineFilters = {}) {
  const limit = Math.min(200, Math.max(1, filters.limit || 80));
  const explicitEvents = await prisma.timelineEvent.findMany({
    where: await timelineAccessWhere(user, filters),
    include: timelineInclude(),
    orderBy: { eventDate: "desc" },
    take: limit
  });
  const items = explicitEvents.map(serializeTimelineEvent);
  if (filters.includeDerived !== false) {
    items.push(...await derivedTimelineItems(user, filters));
  }
  return items
    .sort((left, right) => new Date(right.eventDate).getTime() - new Date(left.eventDate).getTime())
    .slice(0, limit);
}

export function timelineInclude() {
  return {
    property: { select: { id: true, name: true, address: true } },
    unit: { select: { id: true, unitNumber: true } },
    tenantProfile: { select: { id: true, firstName: true, lastName: true, email: true } },
    brokerUser: { select: { id: true, name: true, email: true } },
    documents: {
      include: {
        document: { select: { id: true, title: true, filename: true } }
      }
    }
  } satisfies Prisma.TimelineEventInclude;
}

export function serializeTimelineEvent(event: TimelineEvent & Prisma.TimelineEventGetPayload<{ include: ReturnType<typeof timelineInclude> }>): TimelineItem {
  return {
    id: event.id,
    source: "timeline",
    eventType: event.eventType,
    eventTypeLabel: timelineEventLabel(event.eventType),
    status: event.status,
    title: event.title,
    description: event.description,
    eventDate: event.eventDate.toISOString(),
    endDate: event.endDate?.toISOString() || null,
    dueDate: event.dueDate?.toISOString() || null,
    costAmount: event.costAmount?.toString() || null,
    costCurrency: event.costCurrency,
    costCategory: event.costCategory,
    isInternal: event.isInternal,
    property: event.property,
    unit: event.unit,
    tenantProfile: event.tenantProfile,
    brokerUser: event.brokerUser,
    documents: event.documents.map((link) => ({
      id: link.document.id,
      title: link.document.title,
      filename: link.document.filename,
      previewUrl: `/api/documents/${link.document.id}/preview`,
      downloadUrl: `/api/documents/${link.document.id}/download`
    })),
    href: event.propertyId ? `/properties/${event.propertyId}#timeline-${event.id}` : null
  };
}

export function timelineEventLabel(value: string) {
  return TIMELINE_EVENT_TYPES.find((item) => item.value === value)?.label || value;
}

async function derivedTimelineItems(user: TimelineUser, filters: TimelineFilters): Promise<TimelineItem[]> {
  const base = await derivedBaseWhere(user, filters);
  const canSeeInternal = user.role === Role.ADMIN && filters.includeInternal !== false;
  const [tenants, contracts, rentPayments] = await Promise.all([
    prisma.tenantProfile.findMany({
      where: base.tenantWhere,
      include: { unit: { include: { property: { select: { id: true, name: true, address: true } } } } },
      take: 200
    }),
    prisma.leaseContract.findMany({
      where: base.contractWhere,
      include: {
        unit: { include: { property: { select: { id: true, name: true, address: true } } } },
        tenantProfile: { select: { id: true, firstName: true, lastName: true, email: true } },
        template: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 100
    }),
    canSeeInternal ? prisma.rentPayment.findMany({
      where: base.rentPaymentWhere,
      include: {
        unit: { include: { property: { select: { id: true, name: true, address: true } } } },
        tenantProfile: { select: { id: true, firstName: true, lastName: true, email: true } }
      },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      take: 100
    }) : []
  ]);

  const items: TimelineItem[] = [];
  for (const tenant of tenants) {
    if (tenant.moveInDate) {
      items.push(derivedItem({
        id: `tenant-move-in-${tenant.id}`,
        source: "tenant",
        eventType: "TENANT_MOVE_IN",
        status: tenant.isCurrent ? "INFO" : "DONE",
        title: `${tenant.firstName} ${tenant.lastName} ist eingezogen`,
        description: tenant.unit ? `${tenant.unit.property.name} / ${tenant.unit.unitNumber}` : null,
        eventDate: tenant.moveInDate,
        property: tenant.unit?.property || null,
        unit: tenant.unit ? { id: tenant.unit.id, unitNumber: tenant.unit.unitNumber } : null,
        tenantProfile: tenant
      }));
    }
    if (tenant.moveOutDate) {
      items.push(derivedItem({
        id: `tenant-move-out-${tenant.id}`,
        source: "tenant",
        eventType: "TENANT_MOVE_OUT",
        status: "DONE",
        title: `${tenant.firstName} ${tenant.lastName} ist ausgezogen`,
        description: tenant.unit ? `${tenant.unit.property.name} / ${tenant.unit.unitNumber}` : null,
        eventDate: tenant.moveOutDate,
        property: tenant.unit?.property || null,
        unit: tenant.unit ? { id: tenant.unit.id, unitNumber: tenant.unit.unitNumber } : null,
        tenantProfile: tenant
      }));
    }
    if (tenant.depositPaidAt && canSeeInternal) {
      items.push(derivedItem({
        id: `deposit-paid-${tenant.id}`,
        source: "tenant",
        eventType: "DEPOSIT_PAID",
        status: "PAID",
        title: `Kaution bezahlt: ${moneyLabel(tenant.depositPaidAmount)}`,
        description: `${tenant.firstName} ${tenant.lastName}`,
        eventDate: tenant.depositPaidAt,
        costAmount: tenant.depositPaidAmount?.toString() || null,
        property: tenant.unit?.property || null,
        unit: tenant.unit ? { id: tenant.unit.id, unitNumber: tenant.unit.unitNumber } : null,
        tenantProfile: tenant,
        isInternal: true
      }));
    }
    if (tenant.depositReturnedAt && canSeeInternal) {
      items.push(derivedItem({
        id: `deposit-returned-${tenant.id}`,
        source: "tenant",
        eventType: "DEPOSIT_RETURNED",
        status: "DONE",
        title: `Kaution zurueckgezahlt: ${moneyLabel(tenant.depositReturnedAmount)}`,
        description: `${tenant.firstName} ${tenant.lastName}`,
        eventDate: tenant.depositReturnedAt,
        costAmount: tenant.depositReturnedAmount?.toString() || null,
        property: tenant.unit?.property || null,
        unit: tenant.unit ? { id: tenant.unit.id, unitNumber: tenant.unit.unitNumber } : null,
        tenantProfile: tenant,
        isInternal: true
      }));
    }
  }

  for (const contract of contracts) {
    items.push(derivedItem({
      id: `contract-${contract.id}`,
      source: "contract",
      eventType: "CONTRACT_CREATED",
      status: "DONE",
      title: `Mietvertrag erzeugt${contract.template?.name ? ` (${contract.template.name})` : ""}`,
      description: `${contract.tenantProfile.firstName} ${contract.tenantProfile.lastName}`,
      eventDate: contract.createdAt,
      property: contract.unit.property,
      unit: { id: contract.unit.id, unitNumber: contract.unit.unitNumber },
      tenantProfile: contract.tenantProfile,
      href: `/contracts#contract-${contract.id}`
    }));
  }

  for (const payment of rentPayments) {
    const isPartial = payment.status === "PARTIAL";
    const isPaid = payment.status === "PAID";
    items.push(derivedItem({
      id: `rent-${payment.id}`,
      source: "rentPayment",
      eventType: isPaid ? "RENT_PAID" : isPartial ? "RENT_PARTIAL" : "RENT_OPEN",
      status: payment.status,
      title: `${isPaid ? "Miete bezahlt" : isPartial ? "Miete teilweise bezahlt" : "Miete offen"}: ${payment.month}.${payment.year}`,
      description: `${moneyLabel(payment.paidTotalRent)} von ${moneyLabel(payment.expectedTotalRent)}`,
      eventDate: payment.paidAt || new Date(payment.year, payment.month - 1, 1),
      costAmount: payment.paidTotalRent?.toString() || null,
      property: payment.unit.property,
      unit: { id: payment.unit.id, unitNumber: payment.unit.unitNumber },
      tenantProfile: payment.tenantProfile,
      isInternal: true,
      href: `/rent-income?year=${payment.year}&month=${payment.month}`
    }));
  }
  return items;
}

async function derivedBaseWhere(user: TimelineUser, filters: TimelineFilters) {
  const propertyFilter = filters.propertyId ? { propertyId: filters.propertyId } : {};
  const unitFilter = filters.unitId ? { id: filters.unitId } : {};
  const tenantFilter = filters.tenantProfileId ? { id: filters.tenantProfileId } : {};
  const propertyScope = await propertyScopeWhere(user);
  return {
    tenantWhere: {
      AND: [
        tenantFilter,
        user.role === Role.TENANT ? { userId: user.id } : {},
        {
          unit: {
            ...unitFilter,
            ...propertyFilter,
            property: propertyScope
          }
        }
      ]
    } satisfies Prisma.TenantProfileWhereInput,
    contractWhere: {
      AND: [
        filters.tenantProfileId ? { tenantProfileId: filters.tenantProfileId } : {},
        {
          unit: {
            ...unitFilter,
            ...propertyFilter,
            property: propertyScope
          }
        },
        user.role === Role.TENANT ? { tenantProfile: { userId: user.id } } : {}
      ]
    } satisfies Prisma.LeaseContractWhereInput,
    rentPaymentWhere: {
      unit: {
        ...unitFilter,
        ...propertyFilter,
        property: propertyScope
      },
      ...(filters.tenantProfileId ? { tenantProfileId: filters.tenantProfileId } : {})
    } satisfies Prisma.RentPaymentWhereInput
  };
}

async function propertyScopeWhere(user: TimelineUser): Promise<Prisma.PropertyWhereInput> {
  if (user.role === Role.ADMIN) return portalWhere(user);
  if (user.role === Role.BROKER) return { ...portalWhere(user), id: { in: await brokerPropertyIds(user.id) } };
  const unitId = await tenantUnitId(user.id);
  return { ...portalWhere(user), units: { some: { id: unitId || "" } } };
}

type DerivedTimelineInput = {
  id: string;
  source: TimelineItem["source"];
  eventType: string;
  status: string;
  title: string;
  eventDate: Date;
  description?: string | null;
  endDate?: string | null;
  dueDate?: string | null;
  costAmount?: string | null;
  costCurrency?: string;
  costCategory?: string | null;
  isInternal?: boolean;
  property?: TimelineItem["property"];
  unit?: TimelineItem["unit"];
  tenantProfile?: TimelineItem["tenantProfile"];
  brokerUser?: TimelineItem["brokerUser"];
  documents?: TimelineItem["documents"];
  href?: string | null;
};

function derivedItem(input: DerivedTimelineInput): TimelineItem {
  return {
    id: input.id,
    source: input.source,
    eventType: input.eventType,
    eventTypeLabel: timelineEventLabel(input.eventType),
    status: input.status,
    title: input.title,
    description: input.description || null,
    eventDate: input.eventDate.toISOString(),
    endDate: input.endDate || null,
    dueDate: input.dueDate || null,
    costAmount: input.costAmount || null,
    costCurrency: input.costCurrency || "EUR",
    costCategory: input.costCategory || null,
    isInternal: Boolean(input.isInternal),
    property: input.property || null,
    unit: input.unit || null,
    tenantProfile: input.tenantProfile || null,
    brokerUser: input.brokerUser || null,
    documents: input.documents || [],
    href: input.href || (input.property?.id ? `/properties/${input.property.id}#timeline` : null)
  };
}

function moneyLabel(value: Prisma.Decimal | string | number | null | undefined) {
  if (value === null || value === undefined) return "0 EUR";
  const number = Number(value.toString());
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number.isFinite(number) ? number : 0);
}
