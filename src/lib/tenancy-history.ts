import { PrismaClient } from "@prisma/client";

type PrismaLike = PrismaClient;

type BackfillUser = {
  portalInstanceId: string | null;
};

export async function backfillTenancyHistory(prisma: PrismaLike, user: BackfillUser) {
  const portalWhere = user.portalInstanceId ? { portalInstanceId: user.portalInstanceId } : {};
  const documents = await prisma.document.findMany({
    where: {
      ...portalWhere,
      OR: [
        { category: { name: "Mietverträge" } },
        { title: { contains: "Mietvertrag", mode: "insensitive" } },
        { filename: { contains: "Mietvertrag", mode: "insensitive" } }
      ]
    },
    include: { unit: { include: { property: true, tenants: true } }, property: { include: { units: { include: { tenants: true } } } } },
    orderBy: { createdAt: "asc" }
  });

  let matchedDocuments = 0;
  let updatedTenants = 0;
  const touchedUnitIds = new Set<string>();

  for (const document of documents) {
    const date = extractLeaseDate(document.title, document.filename);
    if (!date) continue;
    const candidateTenants = document.unit?.tenants
      || document.property?.units.flatMap((unit) => unit.tenants)
      || [];
    const tenant = bestTenantMatch(`${document.title} ${document.filename}`, candidateTenants);
    if (!tenant?.unitId) continue;
    matchedDocuments += 1;
    const data: { moveInDate?: Date; leaseStartDate?: Date } = {};
    if (!tenant.moveInDate || tenant.moveInDate > date) data.moveInDate = date;
    if (!tenant.leaseStartDate || tenant.leaseStartDate > date) data.leaseStartDate = date;
    if (Object.keys(data).length) {
      await prisma.tenantProfile.update({ where: { id: tenant.id }, data });
      updatedTenants += 1;
    }
    touchedUnitIds.add(tenant.unitId);
  }

  const closedTenancies = await closePreviousTenancies(prisma, user, touchedUnitIds);
  return { documentsChecked: documents.length, matchedDocuments, updatedTenants, closedTenancies };
}

export async function syncCurrentTenancyFlags(prisma: PrismaLike, user: BackfillUser) {
  const today = startOfToday();
  const units = await prisma.unit.findMany({
    where: {
      property: user.portalInstanceId ? { portalInstanceId: user.portalInstanceId } : undefined
    },
    include: { tenants: { include: { user: { select: { email: true, username: true } } }, orderBy: [{ moveInDate: "asc" }, { createdAt: "asc" }] } }
  });

  let updatedTenants = 0;
  let closedTenancies = 0;

  for (const unit of units) {
    const isSharedHousing = unit.isSharedHousing || /\bwg\b/i.test(unit.unitNumber);
    if (isSharedHousing && !unit.isSharedHousing) {
      await prisma.unit.update({ where: { id: unit.id }, data: { isSharedHousing: true } });
    }
    const tenants = unit.tenants;
    if (!isSharedHousing) {
      for (let index = 0; index < tenants.length; index += 1) {
        const tenant = tenants[index];
        const nextTenant = tenants[index + 1];
        if (nextTenant?.moveInDate && !tenant.moveOutDate) {
          await prisma.tenantProfile.update({
            where: { id: tenant.id },
            data: { moveOutDate: nextTenant.moveInDate, isCurrent: false }
          });
          tenant.moveOutDate = nextTenant.moveInDate;
          tenant.isCurrent = false;
          updatedTenants += 1;
          closedTenancies += 1;
        }
      }
    }

    const activeCandidates = tenants.filter((tenant) => isTenantActiveNow(tenant, today));
    const currentTenant = latestTenant(activeCandidates);
    const currentIds = new Set<string>(
      isSharedHousing
        ? activeCandidates.map((tenant) => tenant.id)
        : currentTenant
          ? [currentTenant.id]
          : []
    );

    for (const tenant of tenants) {
      const isCurrent = currentIds.has(tenant.id);
      if (tenant.isCurrent !== isCurrent) {
        await prisma.tenantProfile.update({ where: { id: tenant.id }, data: { isCurrent } });
        updatedTenants += 1;
      }
    }
  }

  return { unitsChecked: units.length, updatedTenants, closedTenancies };
}

async function closePreviousTenancies(prisma: PrismaLike, user: BackfillUser, touchedUnitIds: Set<string>) {
  const units = await prisma.unit.findMany({
    where: {
      id: touchedUnitIds.size ? { in: Array.from(touchedUnitIds) } : undefined,
      property: user.portalInstanceId ? { portalInstanceId: user.portalInstanceId } : undefined
    },
    include: { tenants: { orderBy: [{ moveInDate: "asc" }, { createdAt: "asc" }] } }
  });
  let closed = 0;
  for (const unit of units) {
    if (unit.isSharedHousing) continue;
    const tenants = unit.tenants.filter((tenant) => tenant.moveInDate);
    for (let index = 0; index < tenants.length; index += 1) {
      const tenant = tenants[index];
      const nextTenant = tenants[index + 1];
      const data: { moveOutDate?: Date | null; isCurrent?: boolean } = {};
      if (nextTenant?.moveInDate && !tenant.moveOutDate) {
        data.moveOutDate = nextTenant.moveInDate;
        data.isCurrent = false;
      } else if (!nextTenant && !tenant.moveOutDate) {
        data.isCurrent = true;
      } else if (nextTenant) {
        data.isCurrent = false;
      }
      if (Object.keys(data).length) {
        await prisma.tenantProfile.update({ where: { id: tenant.id }, data });
        closed += 1;
      }
    }
  }
  return closed;
}

export function extractLeaseDate(title: string, filename: string) {
  const text = `${title} ${filename}`;
  const iso = text.match(/(?:^|[^0-9])((?:19[5-9]\d|20[0-4]\d))[-_. ]?([01]\d)[-_. ]?([0-3]\d)(?:[^0-9]|$)/);
  if (!iso) return null;
  const date = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  return Number.isFinite(date.getTime()) ? date : null;
}

function bestTenantMatch(text: string, tenants: Array<{ id: string; firstName: string; lastName: string; unitId: string | null; moveInDate: Date | null; leaseStartDate: Date | null }>) {
  const normalizedText = normalize(text);
  const scored = tenants.map((tenant) => {
    const first = normalize(tenant.firstName);
    const last = normalize(tenant.lastName);
    let score = 0;
    if (last && normalizedText.includes(last)) score += 3;
    if (first && normalizedText.includes(first)) score += 2;
    if (first && last && normalizedText.includes(`${first}${last}`)) score += 3;
    if (first && last && normalizedText.includes(`${last}${first}`)) score += 3;
    return { tenant, score };
  }).sort((a, b) => b.score - a.score);
  return scored[0]?.score >= 3 ? scored[0].tenant : null;
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function startOfToday() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function isTenantActiveNow(tenant: { moveInDate: Date | null; moveOutDate: Date | null; createdAt: Date; user?: { email: string; username: string | null } | null }, today: Date) {
  if (isArchiveTenant(tenant.user)) return false;
  const moveInOk = !tenant.moveInDate || tenant.moveInDate <= today;
  const moveOutOk = !tenant.moveOutDate || tenant.moveOutDate >= today;
  return moveInOk && moveOutOk;
}

function latestTenant<T extends { moveInDate: Date | null; createdAt: Date }>(tenants: T[]) {
  return tenants
    .slice()
    .sort((left, right) => Number(right.moveInDate || right.createdAt) - Number(left.moveInDate || left.createdAt))[0] || null;
}

function isArchiveTenant(user?: { email: string; username: string | null } | null) {
  const marker = `${user?.email || ""} ${user?.username || ""}`.toLowerCase();
  return marker.includes("archiv-");
}
