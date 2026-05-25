import { prisma } from "./prisma";

export function actionLabel(action: string) {
  const labels: Record<string, string> = {
    LOGIN: "Anmeldung",
    FILE_UPLOADED: "Datei hochgeladen",
    FILE_VIEWED: "Datei angesehen",
    FILE_DOWNLOADED: "Datei heruntergeladen",
    PERMISSION_CHANGED: "Rechte geändert",
    CONTRACT_GENERATED: "Vertrag/Formular erzeugt",
    PROPERTY_CHANGED: "Immobilie geändert",
    USER_INVITED: "Benutzer angelegt"
  };
  return labels[action] || action;
}

export function entityLabel(entity?: string | null) {
  const labels: Record<string, string> = {
    User: "Benutzer",
    Document: "Dokument",
    LeaseContract: "Mietvertrag",
    TenantProfile: "Mieter",
    Property: "Immobilie",
    Unit: "Einheit",
    AccessPermission: "Dokumentrecht"
  };
  return entity ? labels[entity] || entity : "System";
}

export function activityTitle(action: string, entity?: string | null, entityId?: string | null, labels?: Map<string, string>) {
  const label = entityId ? labels?.get(`${entity}:${entityId}`) : null;
  if (!label) return entity ? `${actionLabel(action)} · ${entityLabel(entity)}` : actionLabel(action);
  if (action === "PROPERTY_CHANGED") return `Immobilie geändert: ${label}`;
  if (action === "USER_INVITED") return `Benutzer angelegt: ${label}`;
  if (action === "CONTRACT_GENERATED") return `Vertrag/Formular erzeugt: ${label}`;
  if (action === "PERMISSION_CHANGED") return `Rechte geändert: ${label}`;
  if (action.startsWith("FILE_")) return `${actionLabel(action)}: ${label}`;
  return `${actionLabel(action)}: ${label}`;
}

export function activityHref(entity?: string | null, entityId?: string | null) {
  if (!entity) return null;
  if (entity === "Property" && entityId) return `/properties/${entityId}`;
  if (entity === "Document") return "/documents";
  if (entity === "LeaseContract") return "/contracts";
  if (entity === "TenantProfile" || entity === "User" || entity === "AccessPermission") return "/users";
  if (entity === "Unit") return "/properties";
  return null;
}

export async function activityLabelMap(logs: Array<{ entity: string | null; entityId: string | null }>) {
  const map = new Map<string, string>();
  const ids = (entity: string) => Array.from(new Set(logs.filter((log) => log.entity === entity && log.entityId).map((log) => log.entityId as string)));

  const [properties, documents, contracts, tenants, users, units] = await Promise.all([
    prisma.property.findMany({ where: { id: { in: ids("Property") } }, select: { id: true, name: true, address: true } }),
    prisma.document.findMany({ where: { id: { in: ids("Document") } }, select: { id: true, title: true, filename: true } }),
    prisma.leaseContract.findMany({
      where: { id: { in: ids("LeaseContract") } },
      select: {
        id: true,
        docxPath: true,
        tenantProfile: { select: { firstName: true, lastName: true } },
        unit: { select: { unitNumber: true, property: { select: { name: true } } } }
      }
    }),
    prisma.tenantProfile.findMany({ where: { id: { in: ids("TenantProfile") } }, select: { id: true, firstName: true, lastName: true } }),
    prisma.user.findMany({ where: { id: { in: ids("User") } }, select: { id: true, name: true, username: true, email: true } }),
    prisma.unit.findMany({ where: { id: { in: ids("Unit") } }, select: { id: true, unitNumber: true, property: { select: { name: true } } } })
  ]);

  properties.forEach((property) => map.set(`Property:${property.id}`, property.name || property.address));
  documents.forEach((document) => map.set(`Document:${document.id}`, document.title || document.filename));
  contracts.forEach((contract) => {
    const tenant = `${contract.tenantProfile.firstName} ${contract.tenantProfile.lastName}`.trim();
    const unit = `${contract.unit.property.name} / ${contract.unit.unitNumber}`;
    map.set(`LeaseContract:${contract.id}`, [tenant, unit].filter(Boolean).join(" - ") || contract.docxPath.split("/").pop() || "Mietvertrag");
  });
  tenants.forEach((tenant) => map.set(`TenantProfile:${tenant.id}`, `${tenant.firstName} ${tenant.lastName}`.trim() || "Mieter"));
  users.forEach((mappedUser) => map.set(`User:${mappedUser.id}`, mappedUser.name || mappedUser.username || mappedUser.email));
  units.forEach((unit) => map.set(`Unit:${unit.id}`, `${unit.property.name} / ${unit.unitNumber}`));
  return map;
}
