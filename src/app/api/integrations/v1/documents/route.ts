import { DocumentScope, DocumentStatus, Prisma, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { integrationDocumentInclude, integrationDocumentVisibilityWhere, integrationTenantAccessWhere, tenantPersonalDocumentWhere } from "@/lib/integration-document-access";
import { requireIntegrationUser } from "@/lib/integration-auth";
import { serializeDocument } from "@/lib/integration-data";
import { buildDocumentMetadata } from "@/lib/document-metadata";
import { saveUpload } from "@/lib/files";
import { runDocumentOcr } from "@/lib/ocr";
import { brokerPropertyIds } from "@/lib/permissions";
import { assertPropertyInPortal, assertUnitInPortal } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

type IntegrationDocumentUploadInput = {
  file: File;
  title: string;
  propertyId: string | null;
  unitId: string | null;
  tenantProfileId: string | null;
  isPropertyImage: boolean;
  isPrimaryImage: boolean;
  status: DocumentStatus;
  scope: DocumentScope;
  categoryId: string | null;
  summary: string | null;
  tags: string[];
  documentYear: number | null;
  runOcr: boolean;
};

export async function GET(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["read:documents"]);
  if (!user) return response;
  const q = request.nextUrl.searchParams.get("q")?.trim();
  const propertyId = request.nextUrl.searchParams.get("propertyId");
  const unitId = request.nextUrl.searchParams.get("unitId");
  const tenantId = request.nextUrl.searchParams.get("tenantId") || request.nextUrl.searchParams.get("tenantProfileId");
  const categoryId = request.nextUrl.searchParams.get("categoryId");
  const updatedSince = request.nextUrl.searchParams.get("updatedSince");
  const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || "50") || 50));
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") || "1") || 1);
  const tenant = tenantId
    ? await prisma.tenantProfile.findFirst({
        where: { AND: [{ id: tenantId }, await integrationTenantAccessWhere(user)] },
        select: { id: true, userId: true }
      })
    : null;
  if (tenantId && !tenant) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Mieter nicht gefunden oder nicht freigegeben." } }, { status: 404 });
  const where: Prisma.DocumentWhereInput = {
    AND: [
      await integrationDocumentVisibilityWhere(user),
      propertyId ? { OR: [{ propertyId }, { unit: { propertyId } }] } : {},
      unitId ? { unitId } : {},
      tenant ? tenantPersonalDocumentWhere(tenant) : {},
      categoryId ? { categoryId } : {},
      updatedSince ? { updatedAt: { gte: new Date(updatedSince) } } : {},
      q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { filename: { contains: q, mode: "insensitive" } }, { summary: { contains: q, mode: "insensitive" } }, { ocrText: { contains: q, mode: "insensitive" } }] } : {}
    ]
  };
  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      include: integrationDocumentInclude(),
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.document.count({ where })
  ]);
  return NextResponse.json({
    items: documents.map(serializeDocument),
    nextCursor: null,
    nextPage: page * limit < total ? page + 1 : null
  });
}

export async function POST(request: NextRequest) {
  try {
    const { user, response } = await requireIntegrationUser(request);
    if (!user) return response;
    const canWriteAllDocuments = user.tokenScopes.includes("write:documents");
    const canWriteOwnTenantDocuments = user.role === Role.TENANT && user.tokenScopes.includes("write:tenant-documents");
    const input = await parseIntegrationDocumentUpload(request);
    let { propertyId, unitId, tenantProfileId } = input;
  if (canWriteOwnTenantDocuments && !canWriteAllDocuments) {
    const tenant = await prisma.tenantProfile.findFirst({
      where: { userId: user.id, ...(tenantProfileId ? { id: tenantProfileId } : {}) },
      include: { unit: true }
    });
    if (!tenant) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Mieter dürfen nur Dokumente zum eigenen Mietverhältnis hochladen." } }, { status: 403 });
    tenantProfileId = tenant.id;
    unitId = tenant.unitId;
    propertyId = tenant.unit?.propertyId || null;
  }
  if (tenantProfileId) {
    const tenant = await prisma.tenantProfile.findFirst({
      where: { AND: [{ id: tenantProfileId }, await integrationTenantAccessWhere(user)] },
      include: { unit: true }
    });
    if (!tenant) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Mieterbezug gehoert nicht zu dieser Instanz oder ist nicht freigegeben." } }, { status: 403 });
    unitId = tenant.unitId || unitId;
    propertyId = tenant.unit?.propertyId || propertyId;
  }
  if (!(await assertPropertyInPortal(propertyId, user)) || !(await assertUnitInPortal(unitId, user))) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Zuordnung gehoert nicht zu dieser Instanz." } }, { status: 403 });
  }

  const brokerImagePropertyIds = user.role === Role.BROKER && input.isPropertyImage ? await brokerPropertyIds(user.id) : [];
  const canWriteBrokerPropertyImage = user.role === Role.BROKER && input.isPropertyImage && Boolean(propertyId && brokerImagePropertyIds.includes(propertyId));
  const canWriteTenantPropertyImage = user.role === Role.TENANT && canWriteOwnTenantDocuments && input.isPropertyImage && Boolean(propertyId);
  if (!canWriteAllDocuments && !canWriteOwnTenantDocuments && !canWriteBrokerPropertyImage) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Token braucht Scope: write:documents oder write:tenant-documents" } }, { status: 403 });
  }
  if (input.isPropertyImage && !canWriteAllDocuments && !canWriteBrokerPropertyImage && !canWriteTenantPropertyImage) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Immobilienbilder duerfen nur zur eigenen oder freigegebenen Immobilie hochgeladen werden." } }, { status: 403 });
  }
  if (input.categoryId) {
    const category = await prisma.documentCategory.findFirst({
      where: {
        id: input.categoryId,
        OR: [
          { portalInstanceId: null },
          { portalInstanceId: user.portalInstanceId }
        ]
      },
      select: { id: true }
    });
    if (!category) return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Kategorie gehoert nicht zu dieser Instanz." } }, { status: 400 });
  }
  if (input.isPropertyImage && (!savedImageMimeType(input.file).startsWith("image/") || !propertyId)) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Immobilienbilder brauchen eine Immobilie und einen Bilddateityp." } }, { status: 400 });
  }
  if (input.isPropertyImage && input.isPrimaryImage && propertyId) {
    await prisma.document.updateMany({
      where: { portalInstanceId: user.portalInstanceId, propertyId, isPropertyImage: true },
      data: { isPrimaryImage: false }
    });
  }
  const saved = await saveUpload(input.file);
  const document = await prisma.document.create({
    data: {
      portalInstanceId: user.portalInstanceId,
      title: input.title,
      filename: saved.filename,
      mimeType: saved.mimeType,
      size: saved.size,
      storagePath: saved.storagePath,
      status: input.status,
      scope: input.isPropertyImage ? DocumentScope.PROPERTY : tenantProfileId ? DocumentScope.TENANT : input.scope,
      propertyId,
      unitId,
      tenantProfileId,
      categoryId: input.categoryId,
      summary: input.summary,
      tags: input.tags,
      documentYear: input.documentYear,
      isPropertyImage: input.isPropertyImage,
      isPrimaryImage: input.isPrimaryImage,
      uploadedById: user.id
    },
    include: integrationDocumentInclude()
  });
  if (input.runOcr) {
    await runDocumentOcr(document.id);
    const enriched = await prisma.document.findUniqueOrThrow({ where: { id: document.id }, include: integrationDocumentInclude() });
    return NextResponse.json(serializeDocument(enriched), { status: 201 });
  }
  if (!document.summary || !document.tags.length) {
    const metadata = buildDocumentMetadata(document);
    const enriched = await prisma.document.update({ where: { id: document.id }, data: { summary: document.summary || metadata.summary, tags: document.tags.length ? document.tags : metadata.tags }, include: integrationDocumentInclude() });
    return NextResponse.json(serializeDocument(enriched), { status: 201 });
  }
  return NextResponse.json(serializeDocument(document), { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dokument konnte nicht hochgeladen werden.";
    return NextResponse.json({
      error: {
        code: "DOCUMENT_UPLOAD_FAILED",
        message,
        details: uploadErrorDetails(message)
      }
    }, { status: uploadErrorStatus(message) });
  }
}

function savedImageMimeType(file: File) {
  return file.type || "application/octet-stream";
}

async function parseIntegrationDocumentUpload(request: NextRequest): Promise<IntegrationDocumentUploadInput> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await request.json();
    if (!body || typeof body !== "object") throw new Error("Ungueltiger JSON-Body.");
    const data = body as Record<string, unknown>;
    const filename = textValue(data.filename) || textValue(data.fileName) || "dokument.pdf";
    const mimeType = textValue(data.mimeType) || "application/octet-stream";
    const base64 = textValue(data.fileBase64) || textValue(data.base64) || textValue(data.contentBase64);
    if (!base64) throw new Error("Datei fehlt: fileBase64 ist erforderlich.");
    const cleanBase64 = base64.includes(",") ? base64.split(",").pop() || "" : base64;
    if (!/^[A-Za-z0-9+/=\s_-]+$/.test(cleanBase64)) throw new Error("fileBase64 ist ungueltig.");
    const buffer = Buffer.from(cleanBase64.replace(/\s/g, ""), cleanBase64.includes("-") || cleanBase64.includes("_") ? "base64url" : "base64");
    if (!buffer.length) throw new Error("fileBase64 ist leer.");
    return normalizeUploadInput({
      file: new File([new Uint8Array(buffer)], filename, { type: mimeType }),
      title: textValue(data.title) || filename,
      propertyId: textValue(data.propertyId),
      unitId: textValue(data.unitId),
      tenantProfileId: textValue(data.tenantProfileId) || textValue(data.tenantId),
      isPropertyImage: booleanValue(data.isPropertyImage),
      isPrimaryImage: booleanValue(data.isPrimaryImage),
      status: textValue(data.status),
      scope: textValue(data.scope),
      categoryId: textValue(data.categoryId),
      summary: textValue(data.summary) || textValue(data.description),
      tags: arrayValue(data.tags),
      documentYear: numberValue(data.documentYear),
      runOcr: booleanValue(data.runOcr) || booleanValue(data.ocr)
    });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new Error("Datei fehlt.");
  return normalizeUploadInput({
    file,
    title: String(form.get("title") || file.name),
    propertyId: String(form.get("propertyId") || "") || null,
    unitId: String(form.get("unitId") || "") || null,
    tenantProfileId: String(form.get("tenantProfileId") || "") || null,
    isPropertyImage: String(form.get("isPropertyImage") || "") === "true",
    isPrimaryImage: String(form.get("isPrimaryImage") || "") === "true",
    status: String(form.get("status") || ""),
    scope: String(form.get("scope") || ""),
    categoryId: String(form.get("categoryId") || "") || null,
    summary: String(form.get("summary") || "") || null,
    tags: String(form.get("tags") || "").split(",").map((tag) => tag.trim()).filter(Boolean),
    documentYear: numberValue(form.get("documentYear")),
    runOcr: String(form.get("runOcr") || form.get("ocr") || "") === "true"
  });
}

function normalizeUploadInput(input: {
  file: File;
  title: string;
  propertyId?: string | null;
  unitId?: string | null;
  tenantProfileId?: string | null;
  isPropertyImage?: boolean;
  isPrimaryImage?: boolean;
  status?: string | null;
  scope?: string | null;
  categoryId?: string | null;
  summary?: string | null;
  tags?: string[];
  documentYear?: number | null;
  runOcr?: boolean;
}): IntegrationDocumentUploadInput {
  return {
    file: input.file,
    title: input.title || input.file.name,
    propertyId: input.propertyId || null,
    unitId: input.unitId || null,
    tenantProfileId: input.tenantProfileId || null,
    isPropertyImage: Boolean(input.isPropertyImage),
    isPrimaryImage: Boolean(input.isPrimaryImage),
    status: documentStatus(input.status),
    scope: documentScope(input.scope),
    categoryId: input.categoryId || null,
    summary: input.summary || null,
    tags: input.tags || [],
    documentYear: input.documentYear || null,
    runOcr: Boolean(input.runOcr)
  };
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function booleanValue(value: unknown) {
  return value === true || value === "true";
}

function numberValue(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1900 || parsed > 2049) throw new Error("documentYear ist ungueltig.");
  return parsed;
}

function arrayValue(value: unknown) {
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((entry) => entry.trim()).filter(Boolean);
  return [];
}

function documentStatus(value?: string | null) {
  return Object.values(DocumentStatus).includes(value as DocumentStatus) ? value as DocumentStatus : DocumentStatus.AVAILABLE;
}

function documentScope(value?: string | null) {
  return Object.values(DocumentScope).includes(value as DocumentScope) ? value as DocumentScope : DocumentScope.PROPERTY;
}

function uploadErrorDetails(message: string) {
  if (message.includes("fileBase64")) {
    return { field: "fileBase64", reason: message };
  }
  if (message.includes("Dateityp")) {
    return { field: "filename", reason: message };
  }
  if (message.includes("Datei ist zu gross")) {
    return { field: "fileBase64", reason: message };
  }
  return undefined;
}

function uploadErrorStatus(message: string) {
  return [
    "Datei fehlt",
    "Dateityp",
    "Datei ist zu gross",
    "Ungueltig",
    "ungueltig",
    "ungueltiger",
    "fileBase64",
    "documentYear"
  ].some((marker) => message.includes(marker)) ? 400 : 500;
}
