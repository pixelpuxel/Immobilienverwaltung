import { AuditAction, DocumentScope, DocumentStatus, Prisma, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auditLog } from "@/lib/audit";
import { indexDocument } from "@/lib/ai-search";
import { assertSameOrigin, clientIp, requireApiUser } from "@/lib/auth";
import { buildDocumentMetadata, extractDocumentYear } from "@/lib/document-metadata";
import { saveUpload } from "@/lib/files";
import { brokerPropertyIds, brokerVisibleDocumentWhere, tenantUnitId } from "@/lib/permissions";
import { assertPropertyInPortal, assertUnitInPortal, portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

  const baseWhere = await documentVisibilityWhere(user);
  const propertyId = request.nextUrl.searchParams.get("propertyId");
  const unassigned = request.nextUrl.searchParams.get("unassigned") === "1";
  const foldersOnly = request.nextUrl.searchParams.get("folders") === "1";
  const categoryId = request.nextUrl.searchParams.get("categoryId");
  const categoryIds = request.nextUrl.searchParams.get("categoryIds")?.split(",").filter(Boolean) || [];
  const folderYear = request.nextUrl.searchParams.get("folderYear");
  const wantsPagedResult = propertyId || unassigned || request.nextUrl.searchParams.has("limit") || request.nextUrl.searchParams.has("page");
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") || "1") || 1);
  const limit = Math.min(80, Math.max(10, Number(request.nextUrl.searchParams.get("limit") || "40") || 40));
  const scopedWhere: Prisma.DocumentWhereInput = wantsPagedResult
    ? {
        AND: [
          baseWhere,
          unassigned ? { propertyId: null, unitId: null } : propertyId ? { OR: [{ propertyId }, { unit: { propertyId } }] } : {},
          categoryId === "__none__" ? { categoryId: null } : categoryIds.length ? { categoryId: { in: categoryIds } } : categoryId ? { categoryId } : {}
        ]
      }
    : baseWhere;

  if (foldersOnly) {
    const rows = await prisma.document.findMany({
      where: scopedWhere,
      select: {
        id: true,
        title: true,
        filename: true,
        createdAt: true,
        categoryId: true,
        category: { select: { group: true, name: true } }
      },
      orderBy: { createdAt: "desc" }
    });
    const folders = new Map<string, { categoryIds: string[]; categoryId: string | null; categoryLabel: string; year: string; count: number; preview: string[] }>();
    for (const document of rows) {
      const year = extractDocumentYear(document.title, document.filename) || "ohne Jahr";
      const categoryLabel = document.category ? `${document.category.group} / ${document.category.name}` : "Ohne Kategorie";
      const key = `${categoryLabel}:${year}`;
      const folder = folders.get(key) || { categoryIds: [], categoryId: document.categoryId, categoryLabel, year, count: 0, preview: [] };
      folder.count += 1;
      if (document.categoryId && !folder.categoryIds.includes(document.categoryId)) folder.categoryIds.push(document.categoryId);
      if (folder.preview.length < 3) folder.preview.push(document.title);
      folders.set(key, folder);
    }
    return NextResponse.json({
      folders: Array.from(folders.values()).sort((a, b) => {
        const categoryCompare = a.categoryLabel.localeCompare(b.categoryLabel, "de");
        if (categoryCompare !== 0) return categoryCompare;
        return b.year.localeCompare(a.year, "de");
      })
    });
  }

  if (wantsPagedResult) {
    if (folderYear) {
      const rows = await prisma.document.findMany({
        where: scopedWhere,
        include: { property: true, unit: { include: { property: true } }, category: true },
        orderBy: { createdAt: "desc" }
      });
      const filteredRows = rows.filter((document) => {
        const year = extractDocumentYear(document.title, document.filename) || "ohne Jahr";
        return year === folderYear;
      });
      const start = (page - 1) * limit;
      const documents = filteredRows.slice(start, start + limit).map(withGeneratedMetadata);
      return NextResponse.json({
        documents,
        total: filteredRows.length,
        page,
        nextPage: page * limit < filteredRows.length ? page + 1 : null
      });
    }
    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where: scopedWhere,
        include: { property: true, unit: { include: { property: true } }, category: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.document.count({ where: scopedWhere })
    ]);
    return NextResponse.json({
      documents: documents.map(withGeneratedMetadata),
      total,
      page,
      nextPage: page * limit < total ? page + 1 : null
    });
  }

  return NextResponse.json(await prisma.document.findMany({
    where: baseWhere,
    include: { property: true, unit: { include: { property: true } }, category: true },
    orderBy: { createdAt: "desc" },
    take: 200
  }).then((documents) => documents.map(withGeneratedMetadata)));
}

async function documentVisibilityWhere(user: NonNullable<Awaited<ReturnType<typeof requireApiUser>>>): Promise<Prisma.DocumentWhereInput> {
  if (user.role === Role.ADMIN) return portalWhere(user);
  if (user.role === Role.BROKER) {
    const propertyIds = await brokerPropertyIds(user.id);
    return { ...portalWhere(user), ...brokerVisibleDocumentWhere(user.id, propertyIds) };
  }
  const unitId = await tenantUnitId(user.id);
  return {
    ...portalWhere(user),
    OR: [
      { permissions: { some: { userId: user.id, canView: true } } },
      { unitId, category: { visibleToTenant: true }, scope: { in: [DocumentScope.UNIT, DocumentScope.CONTRACT] } }
    ]
  };
}

function withGeneratedMetadata<T extends { summary: string | null; tags: string[]; title: string; filename: string; mimeType?: string | null; createdAt?: Date | string | null; property?: { name: string } | null; unit?: { unitNumber: string; property?: { name: string } | null } | null; category?: { group: string; name: string } | null }>(document: T) {
  if (document.summary && document.tags.length) return document;
  const metadata = buildDocumentMetadata(document);
  return {
    ...document,
    summary: document.summary || metadata.summary,
    tags: document.tags.length ? document.tags : metadata.tags
  };
}

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Datei fehlt." }, { status: 400 });

  const saved = await saveUpload(file);
  const propertyId = String(form.get("propertyId") || "") || null;
  const unitId = String(form.get("unitId") || "") || null;
  const isPropertyImage = String(form.get("isPropertyImage") || "") === "true";
  const isPrimaryImage = String(form.get("isPrimaryImage") || "") === "true";
  if (isPropertyImage && (!file.type.startsWith("image/") || !propertyId)) {
    return NextResponse.json({ error: "Objektbilder brauchen eine Bilddatei und eine Immobilie." }, { status: 400 });
  }
  if (!(await assertPropertyInPortal(propertyId, user)) || !(await assertUnitInPortal(unitId, user))) {
    return NextResponse.json({ error: "Zuordnung gehoert nicht zu dieser Instanz." }, { status: 403 });
  }
  if (isPropertyImage && isPrimaryImage && propertyId) {
    await prisma.document.updateMany({
      where: { portalInstanceId: user.portalInstanceId, propertyId, isPropertyImage: true },
      data: { isPrimaryImage: false }
    });
  }
  const document = await prisma.document.create({
    data: {
      portalInstanceId: user.portalInstanceId,
      title: String(form.get("title") || file.name),
      filename: saved.filename,
      mimeType: saved.mimeType,
      size: saved.size,
      storagePath: saved.storagePath,
      status: (String(form.get("status") || "AVAILABLE") as DocumentStatus),
      scope: (String(form.get("scope") || "PROPERTY") as DocumentScope),
      propertyId,
      unitId,
      categoryId: String(form.get("categoryId") || "") || null,
      isPropertyImage,
      isPrimaryImage,
      uploadedById: user.id
    },
    include: { property: true, unit: { include: { property: true } }, category: true }
  });
  const metadata = buildDocumentMetadata(document);
  const enrichedDocument = await prisma.document.update({
    where: { id: document.id },
    data: metadata
  });
  await auditLog({ userId: user.id, action: AuditAction.FILE_UPLOADED, entity: "Document", entityId: document.id, ipAddress: clientIp(request) });
  indexDocument(document.id).catch((error) => console.error("Document index failed", document.id, error));
  return NextResponse.json(enrichedDocument, { status: 201 });
}
