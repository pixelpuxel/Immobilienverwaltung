import { AuditAction, DocumentScope, DocumentStatus, Role } from "@prisma/client";
import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { clientIp } from "@/lib/auth";
import { buildDocumentMetadata } from "@/lib/document-metadata";
import { safeFilename } from "@/lib/files";
import { integrationDocumentInclude, integrationDocumentVisibilityWhere } from "@/lib/integration-document-access";
import { integrationError, requireIntegrationUser } from "@/lib/integration-auth";
import { serializeDocument } from "@/lib/integration-data";
import { assertPropertyInPortal, assertUnitInPortal, portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

const documentUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  filename: z.string().min(1).optional(),
  status: z.nativeEnum(DocumentStatus).optional(),
  scope: z.nativeEnum(DocumentScope).optional(),
  propertyId: z.string().nullable().optional(),
  unitId: z.string().nullable().optional(),
  tenantProfileId: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  categoryId: z.string().nullable().optional(),
  isPropertyImage: z.boolean().optional(),
  isPrimaryImage: z.boolean().optional(),
  documentYear: z.number().int().min(1900).max(2049).nullable().optional()
});

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["write:documents"]);
  if (!user) return response;

  const body = documentUpdateSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Ungueltige Daten.", issues: body.error.issues } }, { status: 400 });
  }

  const existing = await prisma.document.findFirst({
    where: { AND: [{ id: params.id }, await integrationDocumentVisibilityWhere(user)] }
  });
  if (!existing) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Dokument wurde nicht gefunden." } }, { status: 404 });
  }

  const data = normalizeEmptyStrings(body.data);
  const rename = data.filename ? await renameStoredFile(existing.storagePath, existing.filename, data.filename) : null;
  if (rename) {
    data.filename = rename.filename;
    Object.assign(data, { storagePath: rename.storagePath });
  }
  if (data.tenantProfileId) {
    const tenant = await prisma.tenantProfile.findFirst({
      where: { id: data.tenantProfileId, user: portalWhere(user) },
      include: { unit: true }
    });
    if (!tenant) {
      return integrationError("FORBIDDEN", "Mieterbezug gehoert nicht zu dieser Instanz.", 403);
    }
    data.unitId = tenant.unitId || data.unitId || null;
    data.propertyId = tenant.unit?.propertyId || data.propertyId || null;
    data.scope = DocumentScope.TENANT;
  }
  if (data.unitId) {
    const unit = await prisma.unit.findFirst({ where: { id: data.unitId, property: { portalInstanceId: user.portalInstanceId } } });
    if (unit) data.propertyId = unit.propertyId;
  }
  if (!(await assertPropertyInPortal(data.propertyId, user)) || !(await assertUnitInPortal(data.unitId, user))) {
    return integrationError("FORBIDDEN", "Zuordnung gehoert nicht zu dieser Instanz.", 403);
  }
  if (data.isPrimaryImage) {
    const propertyId = data.propertyId ?? existing.propertyId;
    if (!propertyId) {
      return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Hauptbild braucht eine Immobilie." } }, { status: 400 });
    }
    await prisma.document.updateMany({
      where: { portalInstanceId: user.portalInstanceId, propertyId, isPropertyImage: true, id: { not: params.id } },
      data: { isPrimaryImage: false }
    });
    data.isPropertyImage = true;
  }

  const document = await prisma.document.update({
    where: { id: params.id },
    data,
    include: integrationDocumentInclude()
  });
  const shouldRegenerate = !data.summary && !data.tags && (data.title !== undefined || data.propertyId !== undefined || data.unitId !== undefined || data.categoryId !== undefined || data.documentYear !== undefined);
  const enrichedDocument = shouldRegenerate
    ? await prisma.document.update({ where: { id: params.id }, data: buildDocumentMetadata(document), include: integrationDocumentInclude() })
    : document;

  await auditLog({
    userId: user.id,
    action: AuditAction.PROPERTY_CHANGED,
    entity: "Document",
    entityId: enrichedDocument.id,
    ipAddress: clientIp(request),
    detail: { ...data, storagePath: undefined }
  });
  return NextResponse.json(serializeDocument(enrichedDocument));
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["write:documents"]);
  if (!user) return response;
  if (user.role !== Role.ADMIN) {
    return integrationError("FORBIDDEN", "Dieser Endpunkt braucht einen Eigentuemer-Token.", 403);
  }

  const document = await prisma.document.findFirst({
    where: { AND: [{ id: params.id }, await integrationDocumentVisibilityWhere(user)] }
  });
  if (!document) {
    return integrationError("NOT_FOUND", "Dokument wurde nicht gefunden.", 404);
  }

  await prisma.document.delete({ where: { id: params.id } });
  if (document.storagePath) {
    await fs.unlink(document.storagePath).catch(() => undefined);
  }
  await auditLog({
    userId: user.id,
    action: AuditAction.FILE_DOWNLOADED,
    entity: "Document",
    entityId: document.id,
    ipAddress: clientIp(request),
    detail: { deleted: true, title: document.title, source: "integration" }
  });
  return NextResponse.json({ ok: true });
}

function normalizeEmptyStrings(data: z.infer<typeof documentUpdateSchema>) {
  const normalized = {
    ...data,
    summary: data.summary === "" ? null : data.summary,
    tags: data.tags?.map((tag) => tag.trim()).filter(Boolean)
  };
  for (const key of ["propertyId", "unitId", "tenantProfileId", "categoryId"] as const) {
    if (normalized[key] === "") normalized[key] = null;
  }
  return normalized;
}

async function renameStoredFile(storagePath: string, currentFilename: string, requestedFilename: string) {
  const safeRequested = safeDocumentFilename(requestedFilename, currentFilename);
  if (safeRequested === currentFilename) return null;
  const directory = path.dirname(storagePath);
  const nextStoragePath = path.join(directory, `${Date.now()}-${safeFilename(safeRequested)}`);
  await fs.rename(storagePath, nextStoragePath);
  return { filename: safeRequested, storagePath: nextStoragePath };
}

function safeDocumentFilename(requested: string, current: string) {
  const currentExt = path.extname(current);
  const requestedExt = path.extname(requested);
  const filename = requestedExt ? requested : `${requested}${currentExt}`;
  return safeFilename(filename);
}
