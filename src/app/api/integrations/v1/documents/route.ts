import { DocumentScope, DocumentStatus, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { integrationDocumentInclude, integrationDocumentVisibilityWhere, integrationTenantAccessWhere, tenantPersonalDocumentWhere } from "@/lib/integration-document-access";
import { requireIntegrationUser } from "@/lib/integration-auth";
import { serializeDocument } from "@/lib/integration-data";
import { buildDocumentMetadata } from "@/lib/document-metadata";
import { saveUpload } from "@/lib/files";
import { assertPropertyInPortal, assertUnitInPortal } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

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
      q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { filename: { contains: q, mode: "insensitive" } }, { summary: { contains: q, mode: "insensitive" } }] } : {}
    ]
  };
  const documents = await prisma.document.findMany({
    where,
    include: integrationDocumentInclude(),
    orderBy: { updatedAt: "desc" },
    take: limit
  });
  return NextResponse.json({ items: documents.map(serializeDocument), nextCursor: null });
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["write:documents"]);
  if (!user) return response;
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Datei fehlt." } }, { status: 400 });
  let propertyId = String(form.get("propertyId") || "") || null;
  let unitId = String(form.get("unitId") || "") || null;
  const tenantProfileId = String(form.get("tenantProfileId") || "") || null;
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
  const isPropertyImage = String(form.get("isPropertyImage") || "") === "true";
  const isPrimaryImage = String(form.get("isPrimaryImage") || "") === "true";
  if (isPropertyImage && (!savedImageMimeType(file).startsWith("image/") || !propertyId)) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Immobilienbilder brauchen eine Immobilie und einen Bilddateityp." } }, { status: 400 });
  }
  if (isPropertyImage && isPrimaryImage && propertyId) {
    await prisma.document.updateMany({
      where: { portalInstanceId: user.portalInstanceId, propertyId, isPropertyImage: true },
      data: { isPrimaryImage: false }
    });
  }
  const saved = await saveUpload(file);
  const tags = String(form.get("tags") || "").split(",").map((tag) => tag.trim()).filter(Boolean);
  const document = await prisma.document.create({
    data: {
      portalInstanceId: user.portalInstanceId,
      title: String(form.get("title") || file.name),
      filename: saved.filename,
      mimeType: saved.mimeType,
      size: saved.size,
      storagePath: saved.storagePath,
      status: String(form.get("status") || "AVAILABLE") as DocumentStatus,
      scope: tenantProfileId ? DocumentScope.TENANT : (String(form.get("scope") || "PROPERTY") as DocumentScope),
      propertyId,
      unitId,
      tenantProfileId,
      categoryId: String(form.get("categoryId") || "") || null,
      summary: String(form.get("summary") || "") || null,
      tags,
      isPropertyImage,
      isPrimaryImage,
      uploadedById: user.id
    },
    include: integrationDocumentInclude()
  });
  if (!document.summary || !document.tags.length) {
    const metadata = buildDocumentMetadata(document);
    const enriched = await prisma.document.update({ where: { id: document.id }, data: { summary: document.summary || metadata.summary, tags: document.tags.length ? document.tags : metadata.tags }, include: integrationDocumentInclude() });
    return NextResponse.json(serializeDocument(enriched), { status: 201 });
  }
  return NextResponse.json(serializeDocument(document), { status: 201 });
}

function savedImageMimeType(file: File) {
  return file.type || "application/octet-stream";
}
