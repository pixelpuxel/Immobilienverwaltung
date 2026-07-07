import type { User } from "@prisma/client";
import { readPrivateFile, safeFilename } from "./files";
import { prisma } from "./prisma";
import { createZip, safeZipPath } from "./zip";

export async function buildDocumentExportZip(exportId: string, user: Pick<User, "portalInstanceId">) {
  const documentExport = await prisma.documentExport.findFirst({
    where: { id: exportId, portalInstanceId: user.portalInstanceId },
    include: {
      items: {
        orderBy: { addedAt: "asc" },
        include: { document: { include: { property: true, unit: { include: { property: true } }, category: true } } }
      }
    }
  });
  if (!documentExport) return { error: "Export nicht gefunden.", status: 404 as const };
  if (!documentExport.items.length) return { error: "Der Export enthaelt noch keine Dokumente.", status: 400 as const };

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

  const filename = `${safeFilename(documentExport.name)}.zip`;
  return {
    documentExport,
    filename,
    data: createZip(entries)
  };
}
