import { AuditAction, DocumentScope, DocumentStatus, Role } from "@prisma/client";
import fs from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { assertSameOrigin, clientIp, requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const documentUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  status: z.nativeEnum(DocumentStatus).optional(),
  scope: z.nativeEnum(DocumentScope).optional(),
  propertyId: z.string().nullable().optional(),
  unitId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional()
});

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!assertSameOrigin(request)) {
    return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  }
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });

  const body = documentUpdateSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Ungueltige Daten.", issues: body.error.issues }, { status: 400 });

  const data = normalizeEmptyStrings(body.data);
  if (data.unitId) {
    const unit = await prisma.unit.findUnique({ where: { id: data.unitId } });
    if (unit) data.propertyId = unit.propertyId;
  }

  const document = await prisma.document.update({
    where: { id: params.id },
    data
  });
  await auditLog({
    userId: user.id,
    action: AuditAction.PROPERTY_CHANGED,
    entity: "Document",
    entityId: document.id,
    ipAddress: clientIp(request),
    detail: data
  });
  return NextResponse.json(document);
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  if (!assertSameOrigin(request)) {
    return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  }
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });

  const document = await prisma.document.findUnique({ where: { id: params.id } });
  if (!document) return NextResponse.json({ error: "Dokument wurde nicht gefunden." }, { status: 404 });
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
    detail: { deleted: true, title: document.title }
  });
  return NextResponse.json({ ok: true });
}

function normalizeEmptyStrings(data: z.infer<typeof documentUpdateSchema>) {
  const normalized = { ...data };
  for (const key of ["propertyId", "unitId", "categoryId"] as const) {
    if (normalized[key] === "") normalized[key] = null;
  }
  return normalized;
}
