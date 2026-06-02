import { AuditAction, DocumentScope, DocumentStatus } from "@prisma/client";
import fs from "fs/promises";
import path from "path";
import { env } from "./env";
import { safeFilename } from "./files";
import { prisma } from "./prisma";
import { formatPropertyAddress } from "./property-address";

export async function generateWohnungsgeberbestaetigung(input: { tenantProfileId: string; actorUserId: string }) {
  const tenant = await prisma.tenantProfile.findUniqueOrThrow({
    where: { id: input.tenantProfileId },
    include: { user: true, unit: { include: { property: true } } }
  });
  if (!tenant.unit) throw new Error("Dem Mieter ist keine Einheit zugeordnet.");

  const owner = await prisma.user.findFirst({ where: { role: "ADMIN", active: true, portalInstanceId: tenant.user.portalInstanceId }, orderBy: { createdAt: "asc" } });
  const category = await prisma.documentCategory.upsert({
    where: { portalInstanceId_name: { portalInstanceId: tenant.user.portalInstanceId || "", name: "Wohnungsgeberbestätigung" } },
    update: { group: "Vermietung", portalInstanceId: tenant.user.portalInstanceId },
    create: { group: "Vermietung", name: "Wohnungsgeberbestätigung", portalInstanceId: tenant.user.portalInstanceId }
  });
  const existing = await prisma.document.findFirst({
    where: {
      categoryId: category.id,
      permissions: { some: { userId: tenant.userId } }
    }
  });
  if (existing) {
    throw new Error("Es existiert bereits eine Wohnungsgeberbestaetigung. Bitte zuerst die alte Datei loeschen.");
  }

  await fs.mkdir(env.contractsPath, { recursive: true });
  const baseName = safeFilename(`Wohnungsgeberbestaetigung-${tenant.lastName}-${tenant.unit.unitNumber}-${Date.now()}`);
  const storagePath = path.join(env.contractsPath, `${baseName}.pdf`);
  const signature = owner?.ownerSignaturePath ? await readJpegSignature(owner.ownerSignaturePath).catch(() => null) : null;
  await fs.writeFile(storagePath, createWohnungsgeberPdf({
    tenantName: `${tenant.firstName} ${tenant.lastName}`,
    address: formatPropertyAddress(tenant.unit.property),
    unitDescription: tenant.unit.unitNumber,
    moveInDate: formatDate(tenant.moveInDate),
    ownerName: owner?.contactPerson || owner?.name || "Eigentümer / Verwaltung",
    ownerAddress: owner?.contactAddress || owner?.contactEmail || owner?.email || "",
    city: cityFromAddress(owner?.contactAddress) || tenant.unit.property.city || "Musterstadt",
    signature
  }), { flag: "wx" });
  const stat = await fs.stat(storagePath);
  const document = await prisma.document.create({
    data: {
      title: `Wohnungsgeberbestaetigung ${tenant.firstName} ${tenant.lastName}`,
      portalInstanceId: tenant.user.portalInstanceId,
      filename: path.basename(storagePath),
      mimeType: "application/pdf",
      size: stat.size,
      storagePath,
      status: DocumentStatus.AVAILABLE,
      scope: DocumentScope.TENANT,
      propertyId: tenant.unit.propertyId,
      unitId: tenant.unitId,
      categoryId: category.id,
      uploadedById: input.actorUserId,
      permissions: {
        create: { userId: tenant.userId, canView: true, canDownload: true }
      }
    }
  });
  await prisma.auditLog.create({
    data: {
      userId: input.actorUserId,
      portalInstanceId: tenant.user.portalInstanceId,
      action: AuditAction.CONTRACT_GENERATED,
      entity: "Document",
      entityId: document.id,
      detail: { type: "Wohnungsgeberbestaetigung", tenantProfileId: tenant.id }
    }
  });
  return document;
}

function formatDate(value?: Date | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("de-DE").format(value);
}

function createWohnungsgeberPdf(values: {
  tenantName: string;
  address: string;
  unitDescription: string;
  moveInDate: string;
  ownerName: string;
  ownerAddress: string;
  city: string;
  signature: PdfImage | null;
}) {
  const page1 = [
    line("Wohnungsgeberbestätigung nach § 19 des Bundesmeldegesetzes", 42, 800, 13, true),
    line("Hiermit wird ein Einzug in bzw. Auszug aus folgender Wohnung bestätigt:", 42, 760),
    field(values.address, 42, 736),
    line("Postleitzahl, Ort, Straße, Hausnummer mit Zusatz", 42, 721, 8),
    field(values.unitDescription, 42, 695),
    line("Stockwerk, Wohnungsnummer bzw. Lagebeschreibung der Wohnung im Haus", 42, 680, 8),
    line(`In die vorher genannte Wohnung ist/sind am ${values.moveInDate || "______________"} folgende Person/en`, 42, 640),
    line("eingezogen bzw. ausgezogen:", 42, 622),
    field(`1. ${values.tenantName}`, 42, 596),
    field("2.", 42, 570),
    field("3.", 42, 544),
    field("4.", 42, 518),
    line("5. weitere Personen siehe Rückseite", 42, 493),
    line("Name und Anschrift des Wohnungsgebers lauten:", 42, 458),
    field(values.ownerName, 42, 434),
    line("Name des Wohnungsgebers", 42, 419, 8),
    field(values.ownerAddress, 42, 393),
    line("Postleitzahl, Ort, Straße und Hausnummer, des Wohnungsgebers", 42, 378, 8),
    field("", 42, 352),
    line("Ggf. Name der durch den Wohnungsgeber beauftragten Person", 42, 337, 8),
    line("[x] Der Wohnungsgeber ist gleichzeitig Eigentümer der Wohnung oder", 58, 306),
    line("[ ] Der Wohnungsgeber ist nicht Eigentümer der Wohnung", 58, 286),
    line("Name und Anschrift des Eigentümers lauten:", 42, 256),
    field(values.ownerName, 42, 232),
    line("Name des Eigentümers der Wohnung", 42, 217, 8),
    field(values.ownerAddress, 42, 191),
    line("Postleitzahl, Ort, Straße und Hausnummer, des Eigentümers der Wohnung", 42, 176, 8),
    line("Ich bestätige mit meiner Unterschrift, dass die oben gemachten Angaben den Tatsachen", 42, 136, 9),
    line("entsprechen. Mir ist bekannt, dass es verboten ist, eine Wohnanschrift für eine Anmeldung einem", 42, 122, 9),
    line("Dritten anzubieten oder zur Verfügung zu stellen, obwohl kein tatsächlicher Bezug besteht.", 42, 108, 9),
    line("Ein Verstoß stellt eine Ordnungswidrigkeit dar (§ 54 i.V.m. § 19 BMG).", 42, 94, 9),
    field(`${values.city}, ${new Intl.DateTimeFormat("de-DE").format(new Date())}`, 42, 58, 10),
    line("Ort, Datum", 42, 43, 8),
    values.signature ? "q 120 0 0 42 330 63 cm /Sig1 Do Q" : "",
    field("", 310, 58, 10),
    line("Unterschrift des Wohnungsgebers oder der beauftragten Person", 310, 43, 8)
  ].join("\n");
  return createPdf([page1], values.signature);
}

type PdfImage = { width: number; height: number; bytes: Buffer };

function createPdf(pageStreams: string[], image: PdfImage | null = null) {
  const pageObjectIds = pageStreams.map((_, index) => 3 + index * 2);
  const contentObjectIds = pageStreams.map((_, index) => 4 + index * 2);
  const fontObjectId = 3 + pageStreams.length * 2;
  const imageObjectId = image ? fontObjectId + 1 : null;
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageStreams.length} >>`
  ];
  for (let index = 0; index < pageStreams.length; index += 1) {
    const xObject = imageObjectId && index === 0 ? ` /XObject << /Sig1 ${imageObjectId} 0 R >>` : "";
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObjectId} 0 R >>${xObject} >> /Contents ${contentObjectIds[index]} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(pageStreams[index], "latin1")} >>\nstream\n${pageStreams[index]}\nendstream`);
  }
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  if (image && imageObjectId) {
    objects.push(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n${image.bytes.toString("latin1")}\nendstream`);
  }
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

function pdfText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function line(text: string, x: number, y: number, size = 10, bold = false) {
  return `BT /F1 ${bold ? size + 1 : size} Tf ${x} ${y} Td (${pdfText(text)}) Tj ET`;
}

function field(text: string, x: number, y: number, size = 10) {
  return [
    line(text, x + 4, y + 5, size),
    `${x} ${y} m ${x + 510} ${y} l S`
  ].join("\n");
}

function cityFromAddress(value?: string | null) {
  if (!value) return "";
  const match = value.match(/\b\d{5}\s+([^,\n]+)/);
  return match?.[1]?.trim() || "";
}

async function readJpegSignature(storagePath: string): Promise<PdfImage | null> {
  const bytes = await fs.readFile(storagePath);
  const size = jpegSize(bytes);
  return size ? { ...size, bytes } : null;
}

function jpegSize(bytes: Buffer) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}
