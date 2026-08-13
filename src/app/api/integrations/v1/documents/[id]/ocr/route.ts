import { NextRequest, NextResponse } from "next/server";
import { indexDocument } from "@/lib/ai-search";
import { integrationError, requireIntegrationUser } from "@/lib/integration-auth";
import { integrationDocumentVisibilityWhere } from "@/lib/integration-document-access";
import { isOcrSupported, runDocumentOcr } from "@/lib/ocr";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["read:documents"]);
  if (!user) return response;
  const document = await prisma.document.findFirst({
    where: { AND: [{ id: params.id }, await integrationDocumentVisibilityWhere(user)] }
  });
  if (!document) return integrationError("NOT_FOUND", "Dokument wurde nicht gefunden.", 404);
  return NextResponse.json({
    documentId: document.id,
    supported: isOcrSupported(document),
    status: document.ocrStatus || null,
    processedAt: document.ocrProcessedAt,
    error: document.ocrError,
    text: document.ocrText || ""
  });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["write:documents"]);
  if (!user) return response;
  const document = await prisma.document.findFirst({
    where: { AND: [{ id: params.id }, await integrationDocumentVisibilityWhere(user)] }
  });
  if (!document) return integrationError("NOT_FOUND", "Dokument wurde nicht gefunden.", 404);
  const result = await runDocumentOcr(document.id);
  if (result.status === "DONE" || result.status === "EMPTY") {
    indexDocument(document.id).catch((error) => console.error("Document index failed after OCR", document.id, error));
  }
  return NextResponse.json({
    documentId: document.id,
    supported: isOcrSupported(document),
    status: result.status,
    error: result.error || null,
    textLength: result.text.length,
    processedAt: result.document.ocrProcessedAt
  });
}
