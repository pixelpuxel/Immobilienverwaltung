import { DocumentScope, DocumentStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { integrationDocumentInclude, integrationDocumentVisibilityWhere } from "@/lib/integration-document-access";
import { requireIntegrationUser } from "@/lib/integration-auth";
import { serializeDocument } from "@/lib/integration-data";
import { prisma } from "@/lib/prisma";

const documentUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  filename: z.string().min(1).optional(),
  status: z.nativeEnum(DocumentStatus).optional(),
  scope: z.nativeEnum(DocumentScope).optional(),
  summary: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  isPropertyImage: z.boolean().optional(),
  isPrimaryImage: z.boolean().optional()
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
  if (data.isPrimaryImage) {
    const propertyId = existing.propertyId;
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

  return NextResponse.json(serializeDocument(document));
}

function normalizeEmptyStrings(data: z.infer<typeof documentUpdateSchema>) {
  return {
    ...data,
    summary: data.summary === "" ? null : data.summary,
    tags: data.tags?.map((tag) => tag.trim()).filter(Boolean)
  };
}
