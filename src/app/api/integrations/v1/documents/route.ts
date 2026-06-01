import { DocumentScope, DocumentStatus, Prisma, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationUser } from "@/lib/integration-auth";
import { serializeDocument } from "@/lib/integration-data";
import { buildDocumentMetadata } from "@/lib/document-metadata";
import { saveUpload } from "@/lib/files";
import { brokerPropertyIds, brokerVisibleDocumentWhere, tenantUnitId } from "@/lib/permissions";
import { assertPropertyInPortal, assertUnitInPortal, portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["read:documents"]);
  if (!user) return response;
  const q = request.nextUrl.searchParams.get("q")?.trim();
  const propertyId = request.nextUrl.searchParams.get("propertyId");
  const unitId = request.nextUrl.searchParams.get("unitId");
  const categoryId = request.nextUrl.searchParams.get("categoryId");
  const updatedSince = request.nextUrl.searchParams.get("updatedSince");
  const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || "50") || 50));
  const where: Prisma.DocumentWhereInput = {
    AND: [
      await documentVisibilityWhere(user),
      propertyId ? { OR: [{ propertyId }, { unit: { propertyId } }] } : {},
      unitId ? { unitId } : {},
      categoryId ? { categoryId } : {},
      updatedSince ? { updatedAt: { gte: new Date(updatedSince) } } : {},
      q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { filename: { contains: q, mode: "insensitive" } }, { summary: { contains: q, mode: "insensitive" } }] } : {}
    ]
  };
  const documents = await prisma.document.findMany({
    where,
    include: { property: { select: { id: true, name: true } }, unit: { include: { property: { select: { id: true, name: true } } } }, category: true },
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
  const propertyId = String(form.get("propertyId") || "") || null;
  const unitId = String(form.get("unitId") || "") || null;
  if (!(await assertPropertyInPortal(propertyId, user)) || !(await assertUnitInPortal(unitId, user))) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Zuordnung gehoert nicht zu dieser Instanz." } }, { status: 403 });
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
      status: (String(form.get("status") || "AVAILABLE") as DocumentStatus),
      scope: (String(form.get("scope") || "PROPERTY") as DocumentScope),
      propertyId,
      unitId,
      categoryId: String(form.get("categoryId") || "") || null,
      summary: String(form.get("summary") || "") || null,
      tags,
      uploadedById: user.id
    },
    include: { property: { select: { id: true, name: true } }, unit: { include: { property: { select: { id: true, name: true } } } }, category: true }
  });
  if (!document.summary || !document.tags.length) {
    const metadata = buildDocumentMetadata(document);
    const enriched = await prisma.document.update({ where: { id: document.id }, data: { summary: document.summary || metadata.summary, tags: document.tags.length ? document.tags : metadata.tags }, include: { property: { select: { id: true, name: true } }, unit: { include: { property: { select: { id: true, name: true } } } }, category: true } });
    return NextResponse.json(serializeDocument(enriched), { status: 201 });
  }
  return NextResponse.json(serializeDocument(document), { status: 201 });
}

async function documentVisibilityWhere(user: { id: string; role: Role; portalInstanceId: string | null }) {
  if (user.role === Role.ADMIN) return portalWhere(user);
  if (user.role === Role.BROKER) return { ...portalWhere(user), ...brokerVisibleDocumentWhere(user.id, await brokerPropertyIds(user.id)) };
  const unitId = await tenantUnitId(user.id);
  return {
    ...portalWhere(user),
    OR: [
      { permissions: { some: { userId: user.id, canView: true } } },
      { unitId, category: { visibleToTenant: true }, scope: { in: [DocumentScope.UNIT, DocumentScope.CONTRACT] } }
    ]
  };
}

