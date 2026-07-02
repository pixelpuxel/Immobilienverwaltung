import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { readPrivateFile, safeFilename } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { createZip, safeZipPath } from "@/lib/zip";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const documentExport = await prisma.documentExport.findFirst({
    where: { id: params.id, portalInstanceId: user.portalInstanceId },
    include: {
      items: {
        orderBy: { addedAt: "asc" },
        include: { document: { include: { property: true, unit: { include: { property: true } }, category: true } } }
      }
    }
  });
  if (!documentExport) return NextResponse.json({ error: "Export nicht gefunden." }, { status: 404 });
  if (!documentExport.items.length) return NextResponse.json({ error: "Der Export enthaelt noch keine Dokumente." }, { status: 400 });

  const readme = [
    documentExport.name,
    "",
    documentExport.description || "Keine Beschreibung.",
    "",
    `Erstellt: ${new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(documentExport.createdAt)}`,
    `Dokumente: ${documentExport.items.length}`,
    "",
    "Inhalt:",
    ...documentExport.items.map((item, index) => `${index + 1}. ${item.document.title} (${item.document.filename})`)
  ].join("\n");

  const entries = [{ name: "README.txt", data: Buffer.from(readme, "utf8") }];
  for (const [index, item] of documentExport.items.entries()) {
    const document = item.document;
    const folder = document.unit
      ? `${document.unit.property?.name || document.property?.name || "Immobilie"}/${document.unit.unitNumber}`
      : document.property?.name || "Allgemein";
    const category = document.category ? `${document.category.group} - ${document.category.name}` : "Ohne Kategorie";
    const data = await readPrivateFile(document.storagePath);
    entries.push({
      name: safeZipPath(`${folder}/${category}/${String(index + 1).padStart(3, "0")}-${document.filename}`),
      data
    });
  }

  await prisma.documentExport.update({ where: { id: documentExport.id }, data: { downloadedAt: new Date() } });
  const zip = createZip(entries);
  const filename = `${safeFilename(documentExport.name)}.zip`;
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`
    }
  });
}
