import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { integrationError, requireIntegrationUser } from "@/lib/integration-auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional().default("")
});

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["write:documents"]);
  if (!user) return response;
  const forbidden = requireAdmin(user);
  if (forbidden) return forbidden;

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return integrationError("BAD_REQUEST", "Bitte Eingaben pruefen.", 400);
  const item = await prisma.documentExport.findFirst({ where: { id: params.id, portalInstanceId: user.portalInstanceId }, select: { id: true } });
  if (!item) return integrationError("NOT_FOUND", "Export nicht gefunden.", 404);
  const updated = await prisma.documentExport.update({
    where: { id: item.id },
    data: { name: parsed.data.name, description: parsed.data.description || null },
    include: { items: { include: { document: { select: { id: true, title: true, filename: true, mimeType: true, size: true } } }, orderBy: { addedAt: "asc" } } }
  });
  return NextResponse.json(serializeExport(updated));
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["write:documents"]);
  if (!user) return response;
  const forbidden = requireAdmin(user);
  if (forbidden) return forbidden;

  const item = await prisma.documentExport.findFirst({ where: { id: params.id, portalInstanceId: user.portalInstanceId }, select: { id: true } });
  if (!item) return integrationError("NOT_FOUND", "Export nicht gefunden.", 404);
  await prisma.documentExport.delete({ where: { id: item.id } });
  return NextResponse.json({ ok: true });
}

function requireAdmin(user: { role: Role }) {
  if (user.role !== Role.ADMIN) {
    return integrationError("FORBIDDEN", "Dieser Endpunkt braucht einen Eigentuemer-Token.", 403);
  }
  return null;
}

function serializeExport(item: {
  id: string;
  name: string;
  description: string | null;
  downloadedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: { document: { id: string; title: string; filename: string; mimeType: string; size: number } }[];
}) {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    downloadedAt: item.downloadedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    items: item.items.map((exportItem) => exportItem.document),
    downloadUrl: `/api/integrations/v1/document-exports/${item.id}/download`
  };
}
