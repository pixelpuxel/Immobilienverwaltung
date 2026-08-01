import { safeFilename } from "./files";
import type { ServiceChargeLine } from "./banking-integration";
import type { ServiceChargeStatementSnapshot } from "./service-charge-statement";

const pageWidth = 595;
const pageHeight = 842;
const margin = 36;
const contentWidth = pageWidth - margin * 2;

type PdfOptions = { size?: number; bold?: boolean; indent?: number; gap?: number };
type TableColumn = { label: string; width: number; align?: "left" | "right" | "center" };
type TableCell = string | number;

type PdfContext = {
  pages: string[][];
  y: number;
  current: () => string[];
  newPage: () => void;
  ensure: (height?: number) => void;
  write: (value: string, options?: PdfOptions) => void;
  table: (title: string, columns: TableColumn[], rows: TableCell[][], options?: { footerRows?: TableCell[][]; emptyText?: string }) => void;
};

export function serviceChargeStatementPdfFilename(snapshot: ServiceChargeStatementSnapshot, version: number, tenantName?: string) {
  return safeFilename(`Nebenkostenabrechnung_${snapshot.property.name}_${tenantName || "Gesamt"}_${snapshot.year}_V${version}.pdf`);
}

export function renderServiceChargeStatementPdf(input: {
  snapshot: ServiceChargeStatementSnapshot;
  version: number;
  status: string;
  checksum: string;
  tenantId?: string;
}) {
  const ctx = createPdfContext();
  const rule = input.snapshot.rule;
  const allocation = input.snapshot.allocation;
  const selectedTenant = input.tenantId
    ? allocation.tenantResults.find((tenant) => tenant.tenantId === input.tenantId)
    : null;
  const tenantResults = selectedTenant ? [selectedTenant] : allocation.tenantResults;
  const details = input.snapshot.source.bankingDetails;
  const unitNames = new Map((details?.units || []).map((unit) => [unit.external_id, unit.name]));
  const unitName = (id: string) => unitNames.get(id) || "Einheit ohne Bezeichnung";

  drawHeader(ctx, selectedTenant ? `Nebenkostenabrechnung - ${selectedTenant.tenantName}` : "Nebenkostenabrechnung", input);

  ctx.write("Abrechnungsgrundlage", { size: 12, bold: true, gap: 18 });
  ctx.table("", [
    { label: "Position", width: 190 },
    { label: "Wert", width: contentWidth - 190 }
  ], [
    ["Objekt", `${input.snapshot.property.name} - ${input.snapshot.property.address}`],
    ["Abrechnungsjahr", String(input.snapshot.year)],
    ["Status", input.status === "FINAL" ? "Festgeschrieben" : "Entwurf"],
    ["Methode", methodLabel(input.snapshot.method)],
    ["Verteilerwert gesamt", number(rule.totalDistributionValue)],
    ["Verteiler je Einheit", Object.entries(rule.unitValues).map(([unit, value]) => `${unitName(unit)}: ${number(value)}`).join("; ") || "-"],
    ["Hinweis", rule.note || "-"]
  ]);

  renderSummary(ctx, input, selectedTenant || null);
  renderCalculationDetails(ctx, input, tenantResults, unitName);
  renderCostPositions(ctx, input, selectedTenant?.unitId || null, unitName);
  renderTenancies(ctx, details, tenantResults, unitName);
  renderBankingDetails(ctx, details, selectedTenant || null, unitName);
  renderWarnings(ctx, allocation.warnings, allocation.blockingWarnings || []);

  ctx.pages.forEach((page, index) => {
    page.push(text(`Seite ${index + 1} von ${ctx.pages.length}`, 482, 24, 7));
    page.push(text(`Pruefsumme ${input.checksum.slice(0, 16)}`, margin, 24, 7));
  });
  return buildPdf(ctx.pages.map((page) => page.join("\n")));
}

function createPdfContext(): PdfContext {
  const pages: string[][] = [[]];
  const ctx: PdfContext = {
    pages,
    y: 790,
    current: () => pages[pages.length - 1],
    newPage: () => {
      pages.push([]);
      ctx.y = 790;
    },
    ensure: (height = 20) => {
      if (ctx.y - height < 48) ctx.newPage();
    },
    write: (value: string, options: PdfOptions = {}) => {
      const size = options.size || 9;
      const gap = options.gap || size + 4;
      const width = Math.max(25, Math.floor((contentWidth - (options.indent || 0)) / (size * 0.52)));
      for (const line of wrap(String(value), width)) {
        ctx.ensure(gap);
        ctx.current().push(text(line, margin + (options.indent || 0), ctx.y, size, Boolean(options.bold)));
        ctx.y -= gap;
      }
    },
    table: (title, columns, rows, options = {}) => {
      drawTable(ctx, title, columns, rows, options);
    }
  };
  return ctx;
}

function drawHeader(ctx: PdfContext, titleValue: string, input: { snapshot: ServiceChargeStatementSnapshot; version: number; status: string }) {
  ctx.current().push(fillRect(margin, 764, contentWidth, 46, "0.93 0.98 0.96"));
  ctx.current().push(text(titleValue, margin + 14, 792, 18, true));
  ctx.current().push(text(`${input.snapshot.property.name} | ${input.snapshot.year} | Version ${input.version}`, margin + 14, 774, 9));
  ctx.y = 744;
  ctx.write("Diese Abrechnung zeigt die Berechnungsschritte, die beruecksichtigten Mietzeitraeume, die umlagefaehigen Kosten und die tatsaechlich gebuchten Nebenkostenvorauszahlungen. Betragsbasis sind die im Portal gespeicherten Regeln und die geladenen Bank-/Buchungsdaten.", { size: 8.5, gap: 12 });
  ctx.y -= 8;
}

function renderSummary(ctx: PdfContext, input: { snapshot: ServiceChargeStatementSnapshot }, selectedTenant: ServiceChargeStatementSnapshot["allocation"]["tenantResults"][number] | null) {
  const allocation = input.snapshot.allocation;
  ctx.table("Zusammenfassung", [
    { label: "Kennzahl", width: 235 },
    { label: "Betrag", width: 115, align: "right" },
    { label: "Erlaeuterung", width: contentWidth - 350 }
  ], selectedTenant ? [
    ["Ihr Kostenanteil", money(selectedTenant.allocatedCosts), "Anteil gemaess Verteilschluessel und Belegungstagen"],
    ["Ihre Vorauszahlungen", money(selectedTenant.actualPrepayments), "Tatsaechlich kontierte Nebenkostenvorauszahlungen"],
    [selectedTenant.result >= 0 ? "Nachzahlung" : "Guthaben", money(Math.abs(selectedTenant.result)), selectedTenant.result >= 0 ? "Von Mieter zu zahlen" : "An Mieter zu erstatten"]
  ] : [
    ["Umlagefaehige Kosten", money(allocation.allocableCosts), "Kostenbasis fuer alle Mietverhaeltnisse"],
    ["Mietern zugeordnet", money(allocation.allocatedToTenants), "Summe der berechneten Mieteranteile"],
    ["Eigentuemer / Leerstand", money(allocation.ownerShare), "Nicht auf Mieter entfallender Anteil"],
    ["Vorauszahlungen", money(allocation.totalPrepayments), "Tatsaechlich kontierte NK-Vorauszahlungen"],
    ["Saldo aller Mieter", money(allocation.tenantResults.reduce((sum, item) => sum + item.result, 0)), "Positive Werte sind Nachzahlungen"]
  ]);
}

function renderCalculationDetails(
  ctx: PdfContext,
  input: { snapshot: ServiceChargeStatementSnapshot },
  tenants: ServiceChargeStatementSnapshot["allocation"]["tenantResults"],
  unitName: (id: string) => string
) {
  const allocation = input.snapshot.allocation;
  const rows = tenants.map((tenant) => [
    tenant.tenantName,
    unitName(tenant.unitId),
    `${tenant.occupiedDays}/${tenant.yearDays}`,
    number(tenant.unitValue),
    percent(tenant.share),
    money(tenant.allocatedCosts),
    money(tenant.actualPrepayments),
    tenant.result >= 0 ? `Nachzahlung ${money(tenant.result)}` : `Guthaben ${money(Math.abs(tenant.result))}`
  ]);
  ctx.table("Abrechnung je Mietverhaeltnis", [
    { label: "Mieter", width: 96 },
    { label: "Einheit", width: 70 },
    { label: "Tage", width: 43, align: "right" },
    { label: "Verteiler", width: 48, align: "right" },
    { label: "Anteil", width: 50, align: "right" },
    { label: "Kosten", width: 64, align: "right" },
    { label: "Vorausz.", width: 64, align: "right" },
    { label: "Ergebnis", width: contentWidth - 435, align: "right" }
  ], rows, {
    footerRows: [["Summe", "", "", "", "", money(allocation.allocatedToTenants), money(allocation.totalPrepayments), money(allocation.tenantResults.reduce((sum, item) => sum + item.result, 0))]],
    emptyText: "Keine Mietverhaeltnisse mit berechenbarem Anteil vorhanden."
  });
}

function renderCostPositions(
  ctx: PdfContext,
  input: { snapshot: ServiceChargeStatementSnapshot },
  selectedUnitId: string | null,
  unitName: (id: string) => string
) {
  const statementLines = selectedUnitId
    ? input.snapshot.statementLines.filter((line) => !line.unitId || line.unitId === selectedUnitId)
    : input.snapshot.statementLines;
  ctx.table("Kostenpositionen aus Abrechnungsregel", [
    { label: "Behandlung", width: 82 },
    { label: "Beschreibung", width: 190 },
    { label: "Einheit", width: 90 },
    { label: "Referenz", width: 86 },
    { label: "Betrag", width: contentWidth - 448, align: "right" }
  ], statementLines.map((line) => [
    treatmentLabel(line.treatment),
    [line.description, line.note].filter(Boolean).join(" - "),
    line.unitName || (line.unitId ? unitName(line.unitId) : "Gesamtobjekt"),
    line.sourceReference || "-",
    money(line.amount)
  ]), { emptyText: "Keine manuell erfassten Kostenpositionen. Die Bankpositionen werden unten detailliert ausgewiesen." });
}

function renderTenancies(
  ctx: PdfContext,
  details: ServiceChargeStatementSnapshot["source"]["bankingDetails"] | undefined,
  tenants: ServiceChargeStatementSnapshot["allocation"]["tenantResults"],
  unitName: (id: string) => string
) {
  ctx.write("Vertrags- und Mietkontext", { size: 12, bold: true, gap: 18 });
  if (!details) {
    ctx.write("Keine Banking-Detaildaten im Snapshot vorhanden.");
    return;
  }
  const tenantIds = new Set(tenants.map((tenant) => tenant.tenantId));
  const rows = details.tenancies
    .filter((tenant) => !tenantIds.size || tenantIds.has(tenant.external_id))
    .map((tenant) => [
      tenant.display_name,
      unitName(tenant.unit_external_id),
      `${date(tenant.move_in_date || tenant.lease_start_date)} bis ${tenant.move_out_date ? date(tenant.move_out_date) : "laufend"}`,
      money(Number(tenant.rent_amount || 0)),
      money(Number(tenant.garage_rent || 0)),
      money(Number(tenant.service_charges || 0)),
      money(Number(tenant.actual_service_charge_prepayments || 0))
    ]);
  ctx.table("", [
    { label: "Mieter", width: 112 },
    { label: "Einheit", width: 78 },
    { label: "Zeitraum", width: 100 },
    { label: "Kaltmiete", width: 62, align: "right" },
    { label: "Garage", width: 52, align: "right" },
    { label: "NK Soll", width: 56, align: "right" },
    { label: "NK Ist", width: contentWidth - 460, align: "right" }
  ], rows, { emptyText: "Keine passenden Vertragsdaten im Snapshot." });
}

function renderBankingDetails(
  ctx: PdfContext,
  details: ServiceChargeStatementSnapshot["source"]["bankingDetails"] | undefined,
  selectedTenant: ServiceChargeStatementSnapshot["allocation"]["tenantResults"][number] | null,
  unitName: (id: string) => string
) {
  if (!details) return;
  const relevant = (lines: ServiceChargeLine[], tenantOnly = false) => lines.filter((line) => {
    if (!selectedTenant) return true;
    if (tenantOnly) return line.tenant_external_id === selectedTenant.tenantId;
    return !line.unit_external_id || line.unit_external_id === selectedTenant.unitId;
  });
  bankingTable(ctx, "Umlagefaehige Bank-Kosten", relevant(details.allocableCosts), unitName);
  bankingTable(ctx, "Tatsaechliche Nebenkostenvorauszahlungen", relevant(details.serviceChargePrepayments, true), unitName);
  bankingTable(ctx, "Kaltmietanteile der Zahlungen", relevant(details.coldRent, true), unitName);
  bankingTable(ctx, "Nebenkostenabrechnungszahlungen", relevant(details.serviceChargeSettlements, true), unitName);
}

function bankingTable(ctx: PdfContext, title: string, lines: ServiceChargeLine[], unitName: (id: string) => string) {
  const rows = lines.map((line) => [
    date(line.value_date || line.booking_date),
    line.applicant_name || "Ohne Gegenpartei",
    line.purpose || line.memo || "-",
    line.unit_external_id ? unitName(line.unit_external_id) : "Gesamtobjekt",
    line.bank_reference || line.customer_reference || `TX ${line.transaction_id}`,
    money(Number(line.amount || 0))
  ]);
  ctx.table(title, [
    { label: "Datum", width: 58 },
    { label: "Gegenpartei", width: 92 },
    { label: "Zweck", width: 166 },
    { label: "Einheit", width: 70 },
    { label: "Referenz", width: 78 },
    { label: "Betrag", width: contentWidth - 464, align: "right" }
  ], rows, {
    footerRows: lines.length ? [["Summe", "", "", "", "", money(lines.reduce((sum, line) => sum + Number(line.amount || 0), 0))]] : [],
    emptyText: "Keine Positionen."
  });
}

function renderWarnings(ctx: PdfContext, warnings: string[], blockingWarnings: string[]) {
  if (warnings.length) {
    ctx.write("Pruefhinweise", { size: 12, bold: true, gap: 18 });
    warnings.forEach((warning) => ctx.write(`- ${warning}`));
  }
  if (blockingWarnings.length) {
    ctx.write("Abschluss blockiert", { size: 12, bold: true, gap: 18 });
    blockingWarnings.forEach((warning) => ctx.write(`- ${warning}`));
  }
}

function drawTable(ctx: PdfContext, title: string, columns: TableColumn[], rows: TableCell[][], options: { footerRows?: TableCell[][]; emptyText?: string } = {}) {
  if (title) ctx.write(title, { size: 12, bold: true, gap: 18 });
  if (!rows.length && !(options.footerRows || []).length) {
    ctx.write(options.emptyText || "Keine Daten.", { size: 8.5, gap: 12 });
    ctx.y -= 4;
    return;
  }
  const drawHeader = () => {
    const height = 18;
    ctx.ensure(height + 10);
    ctx.current().push(fillRect(margin, ctx.y - height + 5, contentWidth, height, "0.90 0.95 0.94"));
    let x = margin;
    columns.forEach((column) => {
      ctx.current().push(text(column.label, x + 4, ctx.y - 7, 7.5, true));
      x += column.width;
    });
    ctx.current().push(rect(margin, ctx.y - height + 5, contentWidth, height));
    ctx.y -= height;
  };
  drawHeader();
  [...rows, ...(options.footerRows || [])].forEach((row, index) => {
    const footer = index >= rows.length;
    const wrapped = row.map((cell, cellIndex) => wrapCell(String(cell ?? ""), columns[cellIndex]?.width || 60, footer ? 7.3 : 7));
    const rowHeight = Math.max(18, Math.max(...wrapped.map((lines) => lines.length)) * 9 + 8);
    if (ctx.y - rowHeight < 48) {
      ctx.newPage();
      drawHeader();
    }
    if (footer) ctx.current().push(fillRect(margin, ctx.y - rowHeight + 4, contentWidth, rowHeight, "0.96 0.96 0.96"));
    let x = margin;
    row.forEach((cell, cellIndex) => {
      const column = columns[cellIndex];
      const lines = wrapped[cellIndex];
      const cellWidth = column.width;
      const textX = column.align === "right" ? x + cellWidth - 5 : column.align === "center" ? x + cellWidth / 2 : x + 4;
      lines.forEach((line, lineIndex) => {
        const renderedX = column.align === "right" ? textX - Math.min(cellWidth - 8, line.length * 3.6) : column.align === "center" ? textX - Math.min(cellWidth - 8, line.length * 3.2) / 2 : textX;
        ctx.current().push(text(line, renderedX, ctx.y - 7 - lineIndex * 9, footer ? 7.3 : 7, footer));
      });
      if (cellIndex > 0) ctx.current().push(lineCommand(x, ctx.y + 4, x, ctx.y - rowHeight + 4));
      x += cellWidth;
    });
    ctx.current().push(rect(margin, ctx.y - rowHeight + 4, contentWidth, rowHeight));
    ctx.y -= rowHeight;
  });
  ctx.y -= 10;
}

function fillRect(x: number, y: number, w: number, h: number, rgb: string) {
  return `${rgb} rg ${x} ${y} ${w} ${h} re f 0 0 0 rg`;
}

function rect(x: number, y: number, w: number, h: number) {
  return `0.78 0.82 0.80 RG ${x} ${y} ${w} ${h} re S 0 0 0 RG`;
}

function lineCommand(x1: number, y1: number, x2: number, y2: number) {
  return `0.86 0.88 0.87 RG ${x1} ${y1} m ${x2} ${y2} l S 0 0 0 RG`;
}

function methodLabel(method: string) {
  if (method === "AREA") return "Verteilung nach Flaeche und Belegungstagen.";
  if (method === "FIXED_SHARE") return "Verteilung nach festen Anteilen und Belegungstagen.";
  return "Umlagefaehige Einzelkosten aus der Hausverwaltungsabrechnung; Hausgeldzahlungen wurden nicht verteilt.";
}

function treatmentLabel(value: string) {
  if (value === "ALLOCABLE") return "Umlagefaehig";
  if (value === "NON_ALLOCABLE") return "Nicht umlagefaehig";
  if (value === "RESERVE") return "Erhaltungsruecklage";
  return value;
}

function money(value: number) {
  return `${value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
}

function number(value: number | null) {
  return value === null ? "-" : value.toLocaleString("de-DE", { maximumFractionDigits: 3 });
}

function percent(value: number) {
  return `${(value * 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
}

function date(value: string) {
  if (!value) return "-";
  const match = value.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

function wrap(value: string, width: number) {
  const words = value.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (`${line} ${word}`.trim().length > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = `${line} ${word}`.trim();
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function wrapCell(value: string, width: number, size: number) {
  return wrap(value, Math.max(5, Math.floor(width / (size * 0.55))));
}

function buildPdf(pageStreams: string[]) {
  const pageObjectIds = pageStreams.map((_, index) => 3 + index * 2);
  const contentObjectIds = pageStreams.map((_, index) => 4 + index * 2);
  const fontObjectId = 3 + pageStreams.length * 2;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageStreams.length} >>`
  ];
  pageStreams.forEach((stream, index) => {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectIds[index]} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
  });
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

function text(value: string, x: number, y: number, size = 9, bold = false) {
  return `BT /F1 ${bold ? size + 0.8 : size} Tf ${x} ${y} Td (${pdfText(value)}) Tj ET`;
}

function pdfText(value: string) {
  return value.normalize("NFC")
    .replace(/[–—]/g, "-")
    .replace(/[“”„]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/€/g, "EUR")
    .split("")
    .map((character) => character.charCodeAt(0) <= 255 ? character : "?")
    .join("")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}
