import { AuditAction, DocumentScope, DocumentStatus } from "@prisma/client";
import fs from "fs/promises";
import path from "path";
import { inflateSync, deflateSync } from "zlib";
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
  const signature = owner?.ownerSignaturePath ? await readSignature(owner.ownerSignaturePath).catch(() => null) : null;
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
    values.signature ? signaturePdfCommand(values.signature, 322, 54, 150, 46) : "",
    field("", 310, 58, 10),
    line("Unterschrift des Wohnungsgebers oder der beauftragten Person", 310, 43, 8)
  ].join("\n");
  return createPdf([page1], values.signature);
}

type PdfImage = {
  width: number;
  height: number;
  bytes: Buffer;
  format: "jpeg" | "png-rgb";
  alphaBytes?: Buffer | null;
};

function createPdf(pageStreams: string[], image: PdfImage | null = null) {
  const pageObjectIds = pageStreams.map((_, index) => 3 + index * 2);
  const contentObjectIds = pageStreams.map((_, index) => 4 + index * 2);
  const fontObjectId = 3 + pageStreams.length * 2;
  const imageObjectId = image ? fontObjectId + 1 : null;
  const imageMaskObjectId = image?.alphaBytes ? fontObjectId + 2 : null;
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
    const filter = image.format === "jpeg" ? "/DCTDecode" : "/FlateDecode";
    const softMask = imageMaskObjectId ? ` /SMask ${imageMaskObjectId} 0 R` : "";
    objects.push(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter ${filter}${softMask} /Length ${image.bytes.length} >>\nstream\n${image.bytes.toString("latin1")}\nendstream`);
    if (image.alphaBytes && imageMaskObjectId) {
      objects.push(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${image.alphaBytes.length} >>\nstream\n${image.alphaBytes.toString("latin1")}\nendstream`);
    }
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

function signaturePdfCommand(signature: PdfImage, x: number, y: number, maxWidth: number, maxHeight: number) {
  const aspect = signature.width / Math.max(signature.height, 1);
  let width = maxWidth;
  let height = width / aspect;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspect;
  }
  return `q ${roundPdf(width)} 0 0 ${roundPdf(height)} ${roundPdf(x)} ${roundPdf(y)} cm /Sig1 Do Q`;
}

function roundPdf(value: number) {
  return Math.round(value * 100) / 100;
}

function cityFromAddress(value?: string | null) {
  if (!value) return "";
  const match = value.match(/\b\d{5}\s+([^,\n]+)/);
  return match?.[1]?.trim() || "";
}

async function readSignature(storagePath: string): Promise<PdfImage | null> {
  const bytes = await fs.readFile(storagePath);
  const jpeg = jpegSize(bytes);
  if (jpeg) return { ...jpeg, bytes, format: "jpeg" };
  return pngImage(bytes);
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

function pngImage(bytes: Buffer): PdfImage | null {
  if (!bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return null;
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let palette: Buffer | null = null;
  let paletteAlpha: Buffer | null = null;
  const idat: Buffer[] = [];
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      const interlace = data[12];
      if (bitDepth !== 8 || interlace !== 0 || ![0, 2, 3, 4, 6].includes(colorType)) return null;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "PLTE") {
      palette = data;
    } else if (type === "tRNS") {
      paletteAlpha = data;
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  if (!width || !height || !idat.length) return null;
  if (colorType === 3 && !palette) return null;
  const channels = colorType === 6 ? 4 : colorType === 4 ? 2 : colorType === 2 ? 3 : 1;
  const scanlineLength = width * channels;
  const inflated = inflateSync(Buffer.concat(idat));
  const raw = Buffer.alloc(height * scanlineLength);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const row = inflated.subarray(sourceOffset, sourceOffset + scanlineLength);
    sourceOffset += scanlineLength;
    unfilterScanline(filter, row, raw, y * scanlineLength, scanlineLength, channels);
  }

  const rgb = Buffer.alloc(width * height * 3);
  const alpha = [3, 4, 6].includes(colorType) ? Buffer.alloc(width * height, 0xff) : null;
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    if (colorType === 0) {
      const gray = raw[pixel];
      rgb[pixel * 3] = gray;
      rgb[pixel * 3 + 1] = gray;
      rgb[pixel * 3 + 2] = gray;
    } else if (colorType === 3 && palette) {
      const paletteIndex = raw[pixel];
      const source = paletteIndex * 3;
      rgb[pixel * 3] = palette[source] || 0;
      rgb[pixel * 3 + 1] = palette[source + 1] || 0;
      rgb[pixel * 3 + 2] = palette[source + 2] || 0;
      if (alpha) alpha[pixel] = paletteAlpha?.[paletteIndex] ?? 0xff;
    } else if (colorType === 4) {
      const source = pixel * 2;
      const gray = raw[source];
      rgb[pixel * 3] = gray;
      rgb[pixel * 3 + 1] = gray;
      rgb[pixel * 3 + 2] = gray;
      if (alpha) alpha[pixel] = raw[source + 1];
    } else if (colorType === 2) {
      const source = pixel * 3;
      raw.copy(rgb, pixel * 3, source, source + 3);
    } else {
      const source = pixel * 4;
      rgb[pixel * 3] = raw[source];
      rgb[pixel * 3 + 1] = raw[source + 1];
      rgb[pixel * 3 + 2] = raw[source + 2];
      if (alpha) alpha[pixel] = raw[source + 3];
    }
  }
  return {
    width,
    height,
    bytes: deflateSync(rgb),
    format: "png-rgb",
    alphaBytes: alpha ? deflateSync(alpha) : null
  };
}

function unfilterScanline(filter: number, row: Buffer, output: Buffer, outputOffset: number, length: number, bytesPerPixel: number) {
  for (let index = 0; index < length; index += 1) {
    const raw = row[index];
    const left = index >= bytesPerPixel ? output[outputOffset + index - bytesPerPixel] : 0;
    const up = outputOffset >= length ? output[outputOffset + index - length] : 0;
    const upLeft = outputOffset >= length && index >= bytesPerPixel ? output[outputOffset + index - length - bytesPerPixel] : 0;
    let value = raw;
    if (filter === 1) value = raw + left;
    else if (filter === 2) value = raw + up;
    else if (filter === 3) value = raw + Math.floor((left + up) / 2);
    else if (filter === 4) value = raw + paeth(left, up, upLeft);
    else if (filter !== 0) throw new Error("Unsupported PNG filter.");
    output[outputOffset + index] = value & 0xff;
  }
}

function paeth(left: number, up: number, upLeft: number) {
  const prediction = left + up - upLeft;
  const leftDistance = Math.abs(prediction - left);
  const upDistance = Math.abs(prediction - up);
  const upLeftDistance = Math.abs(prediction - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
}
