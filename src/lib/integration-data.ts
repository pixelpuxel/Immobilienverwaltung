import { type Document, type DocumentCategory, type Prisma, type Property, type Unit } from "@prisma/client";

export function propertySelect(include?: string[]): Prisma.PropertyInclude | undefined {
  if (!include?.length) return undefined;
  return {
    units: include.includes("units"),
    documents: include.includes("documents"),
    brokerValuations: include.includes("brokerValuations")
  };
}

export function serializeProperty(property: Property & { units?: Unit[]; documents?: Document[] }) {
  return {
    ...property,
    livingArea: property.livingArea?.toString() ?? null,
    usableArea: property.usableArea?.toString() ?? null,
    plotArea: property.plotArea?.toString() ?? null,
    rooms: property.rooms?.toString() ?? null,
    expectedPurchasePrice: property.expectedPurchasePrice?.toString() ?? null,
    outstandingLoan: property.outstandingLoan?.toString() ?? null,
    units: property.units?.map(serializeUnit),
    documents: property.documents?.map((document) => ({ id: document.id, title: document.title, filename: document.filename }))
  };
}

export function serializeUnit(unit: Unit) {
  return {
    ...unit,
    rooms: unit.rooms?.toString() ?? null,
    livingArea: unit.livingArea?.toString() ?? null,
    rentAmount: unit.rentAmount?.toString() ?? null,
    garageRent: unit.garageRent?.toString() ?? null,
    serviceCharges: unit.serviceCharges?.toString() ?? null,
    warmRent: unit.warmRent?.toString() ?? null
  };
}

export function serializeDocument(document: Document & {
  property?: { id: string; name: string } | null;
  unit?: { id: string; unitNumber: string; property?: { id: string; name: string } | null } | null;
  category?: DocumentCategory | null;
}) {
  return {
    id: document.id,
    title: document.title,
    filename: document.filename,
    mimeType: document.mimeType,
    size: document.size,
    status: document.status,
    scope: document.scope,
    propertyId: document.propertyId,
    unitId: document.unitId,
    categoryId: document.categoryId,
    property: document.property,
    unit: document.unit,
    category: document.category ? { id: document.category.id, group: document.category.group, name: document.category.name } : null,
    summary: document.summary,
    tags: document.tags,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    previewUrl: `/api/integrations/v1/documents/${document.id}/preview`,
    downloadUrl: `/api/integrations/v1/documents/${document.id}/download`
  };
}

