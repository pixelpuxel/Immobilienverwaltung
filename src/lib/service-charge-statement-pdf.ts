import { safeFilename } from "./files";
import type { ServiceChargeStatementSnapshot } from "./service-charge-statement";

const pageWidth = 595;
const pageHeight = 842;
const margin = 42;
const contentWidth = pageWidth - margin * 2;

type Cell = string | number | null | undefined;

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
  const pages: string[][] = [[]];
  let y = 790;
  const current = () => pages[pages.length - 1];
  const newPage = () => {
    pages.push([]);
    y = 790;
  };
  const ensure = (height = 24) => {
    if (y - height < 58) newPage();
  };
  const drawText = (value: Cell, x: number, lineY: number, size = 9, bold = false) => {
    current().push(text(String(value ?? ""), x, lineY, size, bold));
  };
  const paragraph = (value: string, options: { size?: number; bold?: boolean; gap?: number; width?: number } = {}) => {
    const size = options.size || 9;
    const gap = options.gap || size + 4;
    const width = options.width || contentWidth;
    for (const line of wrap(value, width, size)) {
      ensure(gap);
      drawText(line, margin, y, size, Boolean(options.bold));
      y -= gap;
    }
  };
  const section = (title: string) => {
    y -= 6;
    ensure(24);
    drawText(title, margin, y, 12, true);
    y -= 17;
  };
  const summaryTable = (rows: Array<[string, string]>) => {
    table(["Kennzahl", "Wert"], rows, [310, 185]);
  };

  const rule = input.snapshot.rule;
  const allocation = input.snapshot.allocation;
  const selectedTenant = input.tenantId
    ? allocation.tenantResults.find((tenant) => tenant.tenantId === input.tenantId)
    : null;
  const tenantResults = selectedTenant ? [selectedTenant] : allocation.tenantResults;
  const statementLines = selectedTenant
    ? input.snapshot.statementLines.filter((line) => !line.unitId || line.unitId === selectedTenant.unitId)
    : input.snapshot.statementLines;
  const unitNames = new Map((input.snapshot.source.bankingDetails?.units || []).map((unit) => [unit.external_id, unit.name]));
  const unitName = (id: string | null | undefined) => id ? unitNames.get(id) || "Einheit" : "Gesamtobjekt";

  paragraph(selectedTenant ? `Nebenkostenabrechnung ${input.snapshot.year}` : `Nebenkostenabrechnung Gesamtuebersicht ${input.snapshot.year}`, { size: 20, bold: true, gap: 26 });
  paragraph(`${input.snapshot.property.name} - ${input.snapshot.property.address}`, { size: 11, bold: true });
  paragraph(`Version ${input.version} - ${input.status === "FINAL" ? "festgeschrieben" : "Entwurf"}`, { size: 9 });
  if (selectedTenant) paragraph(`Mieter: ${selectedTenant.tenantName}`, { size: 10, bold: true });

  section("Zusammenfassung");
  summaryTable([
    [selectedTenant ? "Kostenanteil" : "Umlagefaehige Kosten", money(selectedTenant?.allocatedCosts ?? allocation.allocableCosts)],
    ["Vorauszahlungen", money(selectedTenant?.actualPrepayments ?? allocation.totalPrepayments)],
    [
      selectedTenant ? (selectedTenant.result >= 0 ? "Nachzahlung" : "Guthaben") : "Mietern zugeordnet",
      money(selectedTenant ? Math.abs(selectedTenant.result) : allocation.allocatedToTenants)
    ],
    ...(!selectedTenant ? [["Eigentuemer / Leerstand", money(allocation.ownerShare)] as [string, string]] : [])
  ]);

  section("Abrechnungsgrundlage");
  paragraph(methodLabel(input.snapshot.method));
  if (rule.note) paragraph(`Hinweis: ${rule.note}`);
  paragraph(`Verteilerwert gesamt: ${number(rule.totalDistributionValue)}`);

  section("Kostenpositionen");
  if (statementLines.length) {
    table(
      ["Bezeichnung", "Behandlung", "Einheit", "Betrag"],
      statementLines.map((line) => [
        readableLineTitle(line.description, line.sourceReference),
        treatmentLabel(line.treatment),
        line.unitName || unitName(line.unitId),
        money(line.amount)
      ]),
      [220, 105, 95, 75],
      [false, false, false, true]
    );
  } else {
    paragraph("Noch keine Kostenpositionen erfasst.");
  }

  section("Abrechnung je Mietverhaeltnis");
  if (tenantResults.length) {
    table(
      ["Mieter", "Einheit", "Zeitraum", "Ergebnis"],
      tenantResults.map((tenant) => [
        tenant.tenantName,
        unitName(tenant.unitId),
        `${tenant.occupiedDays}/${tenant.yearDays} Tage`,
        `${tenant.result >= 0 ? "Nachzahlung" : "Guthaben"} ${money(Math.abs(tenant.result))}`
      ]),
      [155, 135, 90, 115],
      [false, false, false, true]
    );
  } else {
    paragraph("Keine Mietverhaeltnisse mit berechenbarem Anteil vorhanden. Diese Version ist noch nicht verschickfertig.");
  }

  const warnings = [...allocation.warnings, ...(allocation.blockingWarnings || [])].filter((warning) => {
    if (allocation.allocableCosts > 0 && /weder umlagefaehige Kosten noch Nebenkostenvorauszahlungen/i.test(warning)) return false;
    return true;
  });
  if (warnings.length) {
    section("Pruefhinweise");
    warnings.forEach((warning) => paragraph(`- ${warning}`));
  }

  pages.forEach((page, index) => {
    page.push(text(`Seite ${index + 1} von ${pages.length}`, 480, 28, 7));
    page.push(text(`Pruefcode ${input.checksum.slice(0, 10)}`, margin, 28, 7));
  });
  return buildPdf(pages.map((page) => page.join("\n")));

  function table(headers: string[], rows: Cell[][], widths: number[], rightAlign: boolean[] = []) {
    const headerSize = 8;
    const cellSize = 8;
    const lineHeight = 10;
    const drawHeader = () => {
      ensure(28);
      current().push(rect(margin, y - 18, widths.reduce((sum, width) => sum + width, 0), 22, "0.92 0.97 0.95"));
      let x = margin;
      headers.forEach((header, index) => {
        drawText(header, x + 5, y - 11, headerSize, true);
        x += widths[index];
      });
      y -= 24;
    };
    drawHeader();
    rows.forEach((row) => {
      const wrapped = row.map((cell, index) => wrap(String(cell ?? "-"), widths[index] - 10, cellSize));
      const rowHeight = Math.max(24, Math.max(...wrapped.map((lines) => lines.length)) * lineHeight + 10);
      if (y - rowHeight < 58) {
        newPage();
        drawHeader();
      }
      current().push(rect(margin, y - rowHeight + 3, widths.reduce((sum, width) => sum + width, 0), rowHeight));
      let x = margin;
      wrapped.forEach((lines, index) => {
        lines.forEach((line, lineIndex) => {
          const lineX = rightAlign[index] ? x + widths[index] - 5 - approximateWidth(line, cellSize) : x + 5;
          drawText(line, Math.max(x + 5, lineX), y - 11 - lineIndex * lineHeight, cellSize, rightAlign[index]);
        });
        x += widths[index];
      });
      y -= rowHeight;
    });
    y -= 8;
  }
}

function methodLabel(method: string) {
  if (method === "AREA") return "Verteilung nach Flaeche und Belegungstagen.";
  if (method === "FIXED_SHARE") return "Verteilung nach festen Anteilen und Belegungstagen.";
  return "Umlagefaehige Einzelkosten aus der Hausverwaltungsabrechnung; Hausgeldzahlungen wurden nicht als Kosten verteilt.";
}

function treatmentLabel(value: string) {
  const normalized = value.toUpperCase();
  if (normalized === "ALLOCABLE" || normalized === "UMLAGEFAEHIG_MIETER") return "Umlagefaehig";
  if (normalized === "NON_ALLOCABLE" || normalized === "NICHT_UMLAGEFAEHIG_MIETER") return "Nicht umlagefaehig";
  if (normalized === "RESERVE" || normalized === "RUECKLAGE" || normalized === "ERHALTUNGSRUECKLAGE") return "Ruecklage";
  return "Pruefen";
}

function readableLineTitle(description: string, sourceReference: string | null) {
  const source = readableSource(sourceReference);
  if (!source || source.toLowerCase() === description.toLowerCase()) return description;
  return `${description} (${source})`;
}

function readableSource(value: string | null) {
  if (!value) return "";
  return value
    .replace(/^cm[a-z0-9]{10,}:/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function money(value: number) {
  return `${Number(value || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
}

function number(value: number | null) {
  return value === null ? "-" : value.toLocaleString("de-DE", { maximumFractionDigits: 3 });
}

function wrap(value: string, width: number, size = 9) {
  const maxChars = Math.max(8, Math.floor(width / (size * 0.48)));
  const words = String(value || "").replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (word.length > maxChars) {
      if (line) lines.push(line);
      for (let index = 0; index < word.length; index += maxChars) lines.push(word.slice(index, index + maxChars));
      line = "";
    } else if (`${line} ${word}`.trim().length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = `${line} ${word}`.trim();
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function approximateWidth(value: string, size: number) {
  return value.length * size * 0.48;
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

function rect(x: number, y: number, width: number, height: number, fill?: string) {
  if (fill) return `q ${fill} rg ${x} ${y} ${width} ${height} re f Q`;
  return `q 0.82 0.86 0.84 RG 0.6 w ${x} ${y} ${width} ${height} re S Q`;
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
