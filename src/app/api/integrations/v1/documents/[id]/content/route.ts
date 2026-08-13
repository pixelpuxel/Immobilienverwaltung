import { AuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { auditLog } from "@/lib/audit";
import { readDocumentContent } from "@/lib/document-content";
import { requireIntegrationUser } from "@/lib/integration-auth";
import { canAccessDocument } from "@/lib/permissions";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["read:documents", "download:documents"]);
  if (!user) return response;

  const document = await prisma.document.findFirst({ where: { id: params.id, ...portalWhere(user) } });
  if (!document || !(await canAccessDocument(user, document.id, true))) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Nicht erlaubt." } }, { status: 403 });
  }

  const includeFile = request.nextUrl.searchParams.get("includeFile") === "1" || request.nextUrl.searchParams.get("includeFile") === "true";
  const preferPdf = request.nextUrl.searchParams.get("preferPdf") !== "0";
  const maxChars = Number(request.nextUrl.searchParams.get("maxChars") || "0") || undefined;
  const result = await readDocumentContent({
    id: document.id,
    filename: document.filename,
    mimeType: document.mimeType,
    size: document.size,
    storagePath: document.storagePath,
    includeFile,
    preferPdf,
    maxChars
  });

  await auditLog({
    userId: user.id,
    action: AuditAction.FILE_VIEWED,
    entity: "Document",
    entityId: document.id,
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "integration",
    detail: { source: "integration-content", extractionStatus: result.extractionStatus }
  });

  return NextResponse.json(result);
}
