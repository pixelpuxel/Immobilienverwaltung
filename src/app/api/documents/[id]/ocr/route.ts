import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { canAccessDocument } from "@/lib/permissions";
import { portalWhere } from "@/lib/portal-instance";
import { indexDocument } from "@/lib/ai-search";
import { isOcrSupported, runDocumentOcr } from "@/lib/ocr";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireApiUser(request);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const document = await prisma.document.findFirst({ where: { id: params.id, ...portalWhere(user) } });
  if (!document || !(await canAccessDocument(user, document.id))) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
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
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const document = await prisma.document.findFirst({ where: { id: params.id, ...portalWhere(user) } });
  if (!document) return NextResponse.json({ error: "Dokument wurde nicht gefunden." }, { status: 404 });
  const result = await runDocumentOcr(document.id);
  if (result.status === "DONE" || result.status === "EMPTY") {
    indexDocument(document.id).catch((error) => console.error("Document index failed after OCR", document.id, error));
  }
  return NextResponse.json({
    documentId: document.id,
    status: result.status,
    error: result.error || null,
    textLength: result.text.length,
    processedAt: result.document.ocrProcessedAt
  });
}
