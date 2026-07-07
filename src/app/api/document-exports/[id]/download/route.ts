import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { buildDocumentExportZip } from "@/lib/document-export-zip";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const zip = await buildDocumentExportZip(params.id, user);
  if ("error" in zip) return NextResponse.json({ error: zip.error }, { status: zip.status });
  await prisma.documentExport.update({ where: { id: zip.documentExport.id }, data: { downloadedAt: new Date() } });
  return new NextResponse(new Uint8Array(zip.data), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(zip.filename)}"`
    }
  });
}
