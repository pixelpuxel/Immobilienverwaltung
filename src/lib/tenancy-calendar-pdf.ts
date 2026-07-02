import { safeFilename } from "./files";

export type TenancyCalendarPdfTenant = {
  id: string;
  firstName: string;
  lastName: string;
  moveInDate: Date | string | null;
  moveOutDate: Date | string | null;
  isCurrent: boolean;
};

export type TenancyCalendarPdfUnit = {
  id: string;
  unitNumber: string;
  isSharedHousing: boolean;
  tenants: TenancyCalendarPdfTenant[];
};

const pageWidth = 842;
const pageHeight = 595;
const monthNames = ["Jan", "Feb", "Maerz", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const grayLevels = [0.15, 0.28, 0.4, 0.52, 0.64, 0.76];
const tenantColors = [
  [0.02, 0.48, 0.36],
  [0.05, 0.45, 0.82],
  [0.92, 0.45, 0.02],
  [0.53, 0.25, 0.78],
  [0.86, 0.13, 0.24],
  [0.14, 0.56, 0.6],
  [0.25, 0.32, 0.72],
  [0.45, 0.58, 0.1]
] as const;

export function tenancyCalendarPdfFilename(propertyName: string, year: number) {
  return safeFilename(`Mietverlauf_${propertyName}_${year}.pdf`);
}

export function renderTenancyCalendarPdf(input: { propertyName: string; propertyAddress?: string | null; year: number; units: TenancyCalendarPdfUnit[]; color?: boolean }) {
  const units = input.units.length ? input.units : [{ id: "empty", unitNumber: "Keine Einheiten", isSharedHousing: false, tenants: [] }];
  const pages = units.map((unit, index) => renderUnitPage({
    color: Boolean(input.color),
    propertyName: input.propertyName,
    propertyAddress: input.propertyAddress || "",
    unit,
    pageNumber: index + 1,
    totalPages: units.length,
    year: input.year
  }));
  return buildPdf(pages);
}

function renderUnitPage(input: { color: boolean; propertyName: string; propertyAddress: string; unit: TenancyCalendarPdfUnit; pageNumber: number; totalPages: number; year: number }) {
  const tenants = input.unit.tenants.filter((tenant) => overlapsYear(tenant, input.year));
  const tenantCodes = new Map(tenants.map((tenant, index) => [tenant.id, tenantCode(index)]));
  const rows: string[] = [
    text("Mietverlauf Jahresuebersicht", 34, 558, 16, true),
    text(`${input.propertyName}${input.propertyAddress ? ` - ${input.propertyAddress}` : ""}`, 34, 536, 10),
    text(`Einheit: ${input.unit.unitNumber}${input.unit.isSharedHousing ? " (WG)" : ""}`, 34, 520, 11, true),
    text(`Jahr: ${input.year}`, 730, 558, 12, true),
    text(`Seite ${input.pageNumber} von ${input.totalPages}`, 730, 536, 8),
    text(input.color ? "Farblegende: Belegte Tage sind farbig markiert und tragen weiterhin den Mieter-Code." : "Schwarz-Weiss-Legende: Belegte Tage sind grau markiert und tragen den Mieter-Code aus der Legende.", 34, 501, 8)
  ];

  const labelWidth = 40;
  const left = 34;
  const top = 466;
  const cellWidth = 23.5;
  const rowHeight = 21;
  const cellHeight = 15;

  rows.push(text("Tag", left, top + 17, 6));
  for (let day = 1; day <= 31; day += 1) {
    rows.push(text(String(day), left + labelWidth + (day - 1) * cellWidth + 7, top + 17, 5.5));
  }

  monthNames.forEach((month, monthIndex) => {
    const y = top - monthIndex * rowHeight;
    rows.push(text(month, left, y + 4, 7, true));
    for (let day = 1; day <= 31; day += 1) {
      const valid = day <= daysInMonth(input.year, monthIndex);
      if (!valid) continue;
      const x = left + labelWidth + (day - 1) * cellWidth;
      const dayTenants = tenantsForDay(tenants, input.year, monthIndex, day);
      rows.push(rect(x, y, cellWidth - 1, cellHeight, 1, false, 0.78));
      if (dayTenants.length) {
        const shade = grayLevels[(dayTenants.length - 1) % grayLevels.length];
        rows.push(input.color
          ? colorRect(x, y, cellWidth - 1, cellHeight, colorForTenant(tenants.indexOf(dayTenants[0])))
          : rect(x, y, cellWidth - 1, cellHeight, shade, true));
        const codes = dayTenants.slice(0, 2).map((tenant) => tenantCodes.get(tenant.id)).join("/");
        const label = dayTenants.length > 2 ? `${codes}+` : codes;
        rows.push(text(label, x + 3, y + 4.4, label.length > 3 ? 4.5 : 5.5, false, shade < 0.55 || input.color ? 1 : 0));
      }
    }
  });

  const legendTop = 188;
  rows.push(text("Legende", 34, legendTop, 10, true));
  if (!tenants.length) {
    rows.push(text("In diesem Jahr sind fuer diese Einheit keine belegten Zeitraeume hinterlegt.", 34, legendTop - 18, 8));
  } else {
    tenants.forEach((tenant, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = column === 0 ? 34 : 430;
      const y = legendTop - 18 - row * 17;
      const shade = grayLevels[index % grayLevels.length];
      rows.push(input.color ? colorRect(x, y - 2, 13, 10, colorForTenant(index)) : rect(x, y - 2, 13, 10, shade, true));
      rows.push(text(tenantCodes.get(tenant.id) || "?", x + 3, y, 5, false, shade < 0.55 ? 1 : 0));
      rows.push(text(`${tenantCodes.get(tenant.id)} ${tenantName(tenant)} | ${dateLabel(tenant.moveInDate)} bis ${dateLabel(tenant.moveOutDate)}`, x + 18, y, 7.5));
    });
  }

  rows.push(text("Hinweis: Das Auszugsdatum markiert den ersten nicht mehr belegten Tag.", 34, 28, 7));
  return rows.join("\n");
}

function buildPdf(pageStreams: string[]) {
  const pageObjectIds = pageStreams.map((_, index) => 3 + index * 2);
  const contentObjectIds = pageStreams.map((_, index) => 4 + index * 2);
  const fontObjectId = 3 + pageStreams.length * 2;
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageStreams.length} >>`
  ];
  for (let index = 0; index < pageStreams.length; index += 1) {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectIds[index]} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(pageStreams[index], "latin1")} >>\nstream\n${pageStreams[index]}\nendstream`);
  }
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");

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

function rect(x: number, y: number, width: number, height: number, gray: number, fill = false, strokeGray = gray) {
  const values = [round(x), round(y), round(width), round(height)];
  if (fill) return `q ${round(gray)} g ${values.join(" ")} re f Q`;
  return `q ${round(strokeGray)} G ${values.join(" ")} re S Q`;
}

function colorRect(x: number, y: number, width: number, height: number, color: readonly [number, number, number]) {
  return `q ${color.map(round).join(" ")} rg ${round(x)} ${round(y)} ${round(width)} ${round(height)} re f Q`;
}

function text(value: string, x: number, y: number, size = 9, bold = false, gray = 0) {
  return `BT ${round(gray)} g /F1 ${bold ? size + 0.8 : size} Tf ${round(x)} ${round(y)} Td (${pdfText(value)}) Tj ET`;
}

function pdfText(value: string) {
  return toWinAnsi(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function toWinAnsi(value: string) {
  return value
    .replace(/[–—]/g, "-")
    .replace(/[“”„]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/€/g, "EUR")
    .split("")
    .map((character) => character.charCodeAt(0) <= 255 ? character : "?")
    .join("");
}

function tenantsForDay(tenants: TenancyCalendarPdfTenant[], year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month, day));
  return tenants.filter((tenant) => {
    const start = dateValue(tenant.moveInDate);
    if (!start || date < start) return false;
    const end = dateValue(tenant.moveOutDate);
    return !end || date < end;
  });
}

function overlapsYear(tenant: TenancyCalendarPdfTenant, year: number) {
  const start = dateValue(tenant.moveInDate);
  if (!start) return false;
  const end = dateValue(tenant.moveOutDate) || new Date(Date.UTC(year, 11, 31));
  return start.getUTCFullYear() <= year && end.getUTCFullYear() >= year;
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function dateValue(value: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function tenantCode(index: number) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const first = alphabet[index % alphabet.length];
  const prefix = index >= alphabet.length ? alphabet[Math.floor(index / alphabet.length) - 1] : "";
  return `${prefix}${first}`;
}

function colorForTenant(index: number) {
  return tenantColors[Math.max(0, index) % tenantColors.length];
}

function tenantName(tenant: TenancyCalendarPdfTenant) {
  return `${tenant.firstName} ${tenant.lastName}`.trim() || "Mieter";
}

function dateLabel(value: Date | string | null) {
  const date = dateValue(value);
  if (!date) return "laufend";
  return new Intl.DateTimeFormat("de-DE").format(date);
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
