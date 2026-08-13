import { type BrokerValuation, type Document, type DocumentCategory, type Prisma, type Property, type Unit, type User } from "@prisma/client";

export function propertySelect(include?: string[]): Prisma.PropertyInclude | undefined {
  if (!include?.length) return undefined;
  const wantsDocuments = include.includes("documents");
  const wantsImages = include.includes("images");
  return {
    units: include.includes("units"),
    documents: wantsDocuments || wantsImages
      ? {
          where: wantsDocuments ? undefined : { isPropertyImage: true },
          orderBy: [
            { isPrimaryImage: "desc" },
            { updatedAt: "desc" }
          ]
        }
      : false,
    brokerValuations: include.includes("brokerValuations")
      ? { include: { user: { select: { id: true, email: true, username: true, name: true, role: true } } }, orderBy: { updatedAt: "desc" } }
      : false
  };
}

export function serializeProperty(property: Property & {
  units?: Unit[];
  documents?: Document[];
  brokerValuations?: Array<BrokerValuation & { user?: Pick<User, "id" | "email" | "username" | "name" | "role"> | null }>;
}, include?: string[]) {
  const wantsImages = include?.includes("images");
  const wantsDocuments = include?.includes("documents");
  const propertyImages = property.documents?.filter((document) => document.isPropertyImage) || [];
  return {
    ...property,
    livingArea: property.livingArea?.toString() ?? null,
    usableArea: property.usableArea?.toString() ?? null,
    plotArea: property.plotArea?.toString() ?? null,
    rooms: property.rooms?.toString() ?? null,
    purchasePrice: property.purchasePrice?.toString() ?? null,
    expectedPurchasePrice: property.expectedPurchasePrice?.toString() ?? null,
    outstandingLoan: property.outstandingLoan?.toString() ?? null,
    units: property.units?.map(serializeUnit),
    documents: wantsDocuments ? property.documents?.map((document) => ({
      id: document.id,
      title: document.title,
      filename: document.filename,
      mimeType: document.mimeType,
      isPropertyImage: document.isPropertyImage,
      isPrimaryImage: document.isPrimaryImage,
      previewUrl: `/api/integrations/v1/documents/${document.id}/preview`
    })) : undefined,
    images: wantsImages ? propertyImages.map((document) => ({
      id: document.id,
      title: document.title,
      filename: document.filename,
      mimeType: document.mimeType,
      size: document.size,
      isPrimaryImage: document.isPrimaryImage,
      previewUrl: `/api/integrations/v1/documents/${document.id}/preview`,
      thumbnailUrl: `/api/integrations/v1/documents/${document.id}/thumbnail`,
      downloadUrl: `/api/integrations/v1/documents/${document.id}/download`
    })) : undefined,
    brokerValuations: property.brokerValuations?.map((valuation) => ({
      id: valuation.id,
      userId: valuation.userId,
      propertyId: valuation.propertyId,
      amount: valuation.amount?.toString() ?? null,
      note: valuation.note,
      createdAt: valuation.createdAt,
      updatedAt: valuation.updatedAt,
      user: valuation.user ? {
        id: valuation.user.id,
        email: valuation.user.email,
        username: valuation.user.username,
        name: valuation.user.name,
        role: valuation.user.role
      } : null
    }))
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
  tenantProfile?: { id: string; firstName: string | null; lastName: string | null; email: string | null; userId: string | null } | null;
  category?: DocumentCategory | null;
  permissions?: Array<{
    id: string;
    userId: string;
    canView: boolean;
    canDownload: boolean;
    user?: { id: string; email: string; username: string | null; name: string | null; role: string } | null;
  }>;
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
    tenantProfileId: document.tenantProfileId,
    categoryId: document.categoryId,
    property: document.property,
    unit: document.unit,
    tenantProfile: document.tenantProfile ? {
      id: document.tenantProfile.id,
      firstName: document.tenantProfile.firstName,
      lastName: document.tenantProfile.lastName,
      email: document.tenantProfile.email,
      userId: document.tenantProfile.userId
    } : null,
    category: document.category ? { id: document.category.id, group: document.category.group, name: document.category.name } : null,
    summary: document.summary,
    tags: document.tags,
    ocrStatus: document.ocrStatus,
    ocrProcessedAt: document.ocrProcessedAt,
    ocrError: document.ocrError,
    ocrText: document.ocrText,
    documentYear: document.documentYear,
    isPropertyImage: document.isPropertyImage,
    isPrimaryImage: document.isPrimaryImage,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    permissions: document.permissions?.map((permission) => ({
      id: permission.id,
      userId: permission.userId,
      canView: permission.canView,
      canDownload: permission.canDownload,
      user: permission.user ? {
        id: permission.user.id,
        email: permission.user.email,
        username: permission.user.username,
        name: permission.user.name,
        role: permission.user.role
      } : null
    })) || [],
    previewUrl: `/api/integrations/v1/documents/${document.id}/preview`,
    downloadUrl: `/api/integrations/v1/documents/${document.id}/download`
  };
}
