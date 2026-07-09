import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { buildDocumentExportZip } from "@/lib/document-export-zip";
import { integrationError, requireIntegrationUser } from "@/lib/integration-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["download:documents"]);
  if (!user) return response;
  const forbidden = requireAdmin(user);
  if (forbidden) return forbidden;

  const zip = await buildDocumentExportZip(params.id, user);
  if ("error" in zip) return integrationError("BAD_REQUEST", zip.error || "Export konnte nicht erstellt werden.", zip.status || 400);
  await prisma.documentExport.update({ where: { id: zip.documentExport.id }, data: { downloadedAt: new Date() } });
  return new NextResponse(new Uint8Array(zip.data), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(zip.filename)}"`
    }
  });
}

function requireAdmin(user: { role: Role }) {
  if (user.role !== Role.ADMIN) {
    return integrationError("FORBIDDEN", "Dieser Endpunkt braucht einen Eigentuemer-Token.", 403);
  }
  return null;
}
