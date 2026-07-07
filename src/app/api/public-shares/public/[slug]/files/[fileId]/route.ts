import { AuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auditLog } from "@/lib/audit";
import { clientIp } from "@/lib/auth";
import { readPrivateFile, safeFilename } from "@/lib/files";
import { isShareExpired } from "@/lib/public-shares";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest, { params }: { params: { slug: string; fileId: string } }) {
  const share = await prisma.publicShare.findUnique({
    where: { slug: params.slug },
    include: { files: true }
  });
  if (!share || isShareExpired(share)) return NextResponse.json({ error: "Freigabe ist nicht verfügbar oder abgelaufen." }, { status: 404 });
  const file = share.files.find((item) => item.id === params.fileId);
  if (!file) return NextResponse.json({ error: "Datei nicht gefunden." }, { status: 404 });
  const data = await readPrivateFile(file.storagePath);
  await prisma.publicShareFile.update({
    where: { id: file.id },
    data: { downloadCount: { increment: 1 }, lastDownloadedAt: new Date() }
  });
  await auditLog({
    portalInstanceId: share.portalInstanceId,
    action: AuditAction.FILE_DOWNLOADED,
    entity: "PublicShareFile",
    entityId: file.id,
    ipAddress: clientIp(request),
    detail: { publicShare: share.name, filename: file.filename, publicLink: true }
  });
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": file.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(safeFilename(file.filename))}"`
    }
  });
}
