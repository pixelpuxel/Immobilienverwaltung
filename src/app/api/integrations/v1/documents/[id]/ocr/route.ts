import { AuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { auditLog } from "@/lib/audit";
import { runAndStoreDocumentOcr } from "@/lib/document-ocr";
import { requireIntegrationUser } from "@/lib/integration-auth";
import { canAccessDocument } from "@/lib/permissions";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export const maxDuration = 900;

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["read:documents"]);
  if (!user) return response;
  const document = await prisma.document.findFirst({
    where: { id: params.id, ...portalWhere(user) },
    select: { id: true, ocrText: true, ocrStatus: true, ocrProcessedAt: true, ocrError: true }
  });
  if (!document || !(await canAccessDocument(user, params.id, true))) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Nicht erlaubt." } }, { status: 403 });
  }
  return NextResponse.json(document);
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["write:documents"]);
  if (!user) return response;
  const document = await prisma.document.findFirst({
    where: { id: params.id, ...portalWhere(user) },
    select: { id: true, filename: true, mimeType: true, storagePath: true }
  });
  if (!document || !(await canAccessDocument(user, params.id, true))) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Nicht erlaubt." } }, { status: 403 });
  }
  try {
    const result = await runAndStoreDocumentOcr(document);
    await auditLog({
      userId: user.id,
      action: AuditAction.FILE_VIEWED,
      entity: "Document",
      entityId: document.id,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "integration",
      detail: { source: "integration-ocr", ocrStatus: result.ocrStatus }
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "OCR fehlgeschlagen.";
    return NextResponse.json({ error: { code: "OCR_FAILED", message } }, { status: 500 });
  }
}
