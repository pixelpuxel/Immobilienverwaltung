import { AuditAction, DocumentScope, DocumentStatus, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auditLog } from "@/lib/audit";
import { assertSameOrigin, clientIp, requireApiUser } from "@/lib/auth";
import { saveUpload } from "@/lib/files";
import { brokerPropertyIds, tenantUnitId } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

  if (user.role === Role.ADMIN) {
    return NextResponse.json(await prisma.document.findMany({ include: { property: true, unit: true, category: true } }));
  }
  if (user.role === Role.BROKER) {
    const propertyIds = await brokerPropertyIds(user.id);
    return NextResponse.json(await prisma.document.findMany({
      where: { propertyId: { in: propertyIds }, permissions: { some: { userId: user.id, canView: true } } },
      include: { property: true, category: true }
    }));
  }
  const unitId = await tenantUnitId(user.id);
  return NextResponse.json(await prisma.document.findMany({
    where: { OR: [{ unitId }, { permissions: { some: { userId: user.id, canView: true } } }] },
    include: { unit: true, category: true }
  }));
}

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Datei fehlt." }, { status: 400 });

  const saved = await saveUpload(file);
  const document = await prisma.document.create({
    data: {
      title: String(form.get("title") || file.name),
      filename: saved.filename,
      mimeType: saved.mimeType,
      size: saved.size,
      storagePath: saved.storagePath,
      status: (String(form.get("status") || "AVAILABLE") as DocumentStatus),
      scope: (String(form.get("scope") || "PROPERTY") as DocumentScope),
      propertyId: String(form.get("propertyId") || "") || null,
      unitId: String(form.get("unitId") || "") || null,
      categoryId: String(form.get("categoryId") || "") || null,
      uploadedById: user.id
    }
  });
  await auditLog({ userId: user.id, action: AuditAction.FILE_UPLOADED, entity: "Document", entityId: document.id, ipAddress: clientIp(request) });
  return NextResponse.json(document, { status: 201 });
}
