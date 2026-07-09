import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { integrationError, requireIntegrationUser } from "@/lib/integration-auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  documentId: z.string().min(1)
});

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["write:documents"]);
  if (!user) return response;
  const forbidden = requireAdmin(user);
  if (forbidden) return forbidden;

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return integrationError("BAD_REQUEST", "Dokument fehlt.", 400);
  const [documentExport, document] = await Promise.all([
    prisma.documentExport.findFirst({ where: { id: params.id, portalInstanceId: user.portalInstanceId }, select: { id: true } }),
    prisma.document.findFirst({ where: { id: parsed.data.documentId, ...portalWhere(user) }, select: { id: true } })
  ]);
  if (!documentExport) return integrationError("NOT_FOUND", "Export nicht gefunden.", 404);
  if (!document) return integrationError("NOT_FOUND", "Dokument nicht gefunden.", 404);
  await prisma.documentExportItem.upsert({
    where: { exportId_documentId: { exportId: documentExport.id, documentId: document.id } },
    update: {},
    create: { exportId: documentExport.id, documentId: document.id }
  });
  const count = await prisma.documentExportItem.count({ where: { exportId: documentExport.id } });
  return NextResponse.json({ ok: true, count });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["write:documents"]);
  if (!user) return response;
  const forbidden = requireAdmin(user);
  if (forbidden) return forbidden;

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return integrationError("BAD_REQUEST", "Dokument fehlt.", 400);
  const documentExport = await prisma.documentExport.findFirst({ where: { id: params.id, portalInstanceId: user.portalInstanceId }, select: { id: true } });
  if (!documentExport) return integrationError("NOT_FOUND", "Export nicht gefunden.", 404);
  await prisma.documentExportItem.deleteMany({ where: { exportId: documentExport.id, documentId: parsed.data.documentId } });
  const count = await prisma.documentExportItem.count({ where: { exportId: documentExport.id } });
  return NextResponse.json({ ok: true, count });
}

function requireAdmin(user: { role: Role }) {
  if (user.role !== Role.ADMIN) {
    return integrationError("FORBIDDEN", "Dieser Endpunkt braucht einen Eigentuemer-Token.", 403);
  }
  return null;
}
