import { safeFilename } from "./files";
import type { ServiceChargeStatementSnapshot } from "./service-charge-statement";

const pageWidth = 595;
const pageHeight = 842;
const margin = 42;

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
  const ensure = (height = 20) => {
    if (y - height < 48) newPage();
  };
  const write = (value: string, options: { size?: number; bold?: boolean; indent?: number; gap?: number } = {}) => {
    const size = options.size || 9;
    const gap = options.gap || size + 4;
    for (const line of wrap(value, options.indent ? 82 : 88)) {
      ensure(gap);
      current().push(text(line, margin + (options.indent || 0), y, size, Boolean(options.bold)));
      y -= gap;
    }
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
  const unitNames = new Map(
    (input.snapshot.source.bankingDetails?.units || []).map((unit) => [unit.external_id, unit.name])
  );
  const unitName = (id: string) => unitNames.get(id) || "Einheit ohne Bezeichnung";

  write(selectedTenant ? `Nebenkostenabrechnung - ${selectedTenant.tenantName}` : "Nebenkostenabrechnung", { size: 18, bold: true, gap: 25 });
  write(`${input.snapshot.property.name} - ${input.snapshot.property.address}`, { size: 11, bold: true });
  write(`Abrechnungsjahr ${input.snapshot.year} | Version ${input.version} | ${input.status === "FINAL" ? "Festgeschrieben" : "Entwurf"}`, { size: 9 });
  y -= 8;
  write("Abrechnungsgrundlage", { size: 12, bold: true, gap: 18 });
  write(methodLabel(input.snapshot.method));
  if (rule.note) write(`Hinweis: ${rule.note}`);
  write(`Verteilerwert gesamt: ${number(rule.totalDistributionValue)} | Einheiten: ${Object.entries(rule.unitValues).map(([unit, value]) => `${unitName(unit)} = ${number(value)}`).join(", ") || "-"}`);
  y -= 5;

  write("Zusammenfassung", { size: 12, bold: true, gap: 18 });
  metric(current(), selectedTenant ? "Ihr Kostenanteil" : "Umlagefaehige Kosten", selectedTenant?.allocatedCosts ?? allocation.allocableCosts, margin, y);
  metric(current(), "Vorauszahlungen", selectedTenant?.actualPrepayments ?? allocation.totalPrepayments, 305, y);
  y -= 24;
  metric(current(), selectedTenant ? (selectedTenant.result >= 0 ? "Nachzahlung" : "Guthaben") : "Mietern zugeordnet", selectedTenant ? Math.abs(selectedTenant.result) : allocation.allocatedToTenants, margin, y);
  if (!selectedTenant) metric(current(), "Eigentuemer / Leerstand", allocation.ownerShare, 305, y);
  y -= 34;

  if (statementLines.length) {
    write("Kostenpositionen", { size: 12, bold: true, gap: 18 });
    for (const line of statementLines) {
      ensure(28);
      current().push(text(`${treatmentLabel(line.treatment)} | ${line.description}`, margin, y, 8.5, true));
      current().push(text(money(line.amount), 475, y, 8.5, true));
      y -= 12;
      if (line.unitName || line.sourceReference) {
        current().push(text([line.unitName || "Gesamtobjekt", line.sourceReference].filter(Boolean).join(" | "), margin + 10, y, 7.5));
        y -= 12;
      }
    }
    y -= 8;
  }

  write("Abrechnung je Mietverhaeltnis", { size: 12, bold: true, gap: 18 });
  for (const tenant of tenantResults) {
    ensure(48);
    current().push(text(tenant.tenantName, margin, y, 9, true));
    current().push(text(`${tenant.occupiedDays}/${tenant.yearDays} Tage`, 330, y, 8));
    y -= 13;
    current().push(text(`Kostenanteil ${money(tenant.allocatedCosts)}`, margin + 10, y, 8));
    current().push(text(`Vorauszahlung ${money(tenant.actualPrepayments)}`, 210, y, 8));
    current().push(text(`${tenant.result >= 0 ? "Nachzahlung" : "Guthaben"} ${money(Math.abs(tenant.result))}`, 395, y, 8, true));
    y -= 20;
  }
  if (!allocation.tenantResults.length) write("Keine Mietverhaeltnisse mit berechenbarem Anteil vorhanden.");

  const details = input.snapshot.source.bankingDetails;
  if (details) {
    const relevantTenancies = selectedTenant
      ? details.tenancies.filter((tenant) => tenant.external_id === selectedTenant.tenantId)
      : details.tenancies;
    write("Vertrags- und Mietkontext", { size: 12, bold: true, gap: 18 });
    relevantTenancies.forEach((tenant) => {
      write(`${tenant.display_name} | ${unitName(tenant.unit_external_id)}`, { bold: true });
      write(
        `Zeitraum ${date(tenant.move_in_date || tenant.lease_start_date)} bis ${tenant.move_out_date ? date(tenant.move_out_date) : "laufend"}`
        + ` | Kaltmiete ${money(Number(tenant.rent_amount || 0))}`
        + ` | Garage ${money(Number(tenant.garage_rent || 0))}`
        + ` | vertragliche NK ${money(Number(tenant.service_charges || 0))}`,
        { indent: 10 }
      );
    });
    if (!relevantTenancies.length) write("Keine passenden Vertragsdaten im Snapshot.");

    const relevant = (lines: typeof details.allocableCosts, tenantOnly = false) => lines.filter((line) => {
      if (!selectedTenant) return true;
      if (tenantOnly) return line.tenant_external_id === selectedTenant.tenantId;
      return !line.unit_external_id || line.unit_external_id === selectedTenant.unitId;
    });
    bankingSection("Umlagefaehige Bank-Kosten", relevant(details.allocableCosts), write, ensure, current, () => y, (next) => { y = next; }, unitName);
    bankingSection("Tatsaechliche Nebenkostenvorauszahlungen", relevant(details.serviceChargePrepayments, true), write, ensure, current, () => y, (next) => { y = next; }, unitName);
    bankingSection("Kaltmietanteile der Zahlungen", relevant(details.coldRent, true), write, ensure, current, () => y, (next) => { y = next; }, unitName);
    bankingSection("Nebenkostenabrechnungszahlungen", relevant(details.serviceChargeSettlements, true), write, ensure, current, () => y, (next) => { y = next; }, unitName);
  }

  if (allocation.warnings.length) {
    write("Pruefhinweise", { size: 12, bold: true, gap: 18 });
    allocation.warnings.forEach((warning) => write(`- ${warning}`));
  }
  if ((allocation.blockingWarnings || []).length) {
    write("Abschluss blockiert", { size: 12, bold: true, gap: 18 });
    (allocation.blockingWarnings || []).forEach((warning) => write(`- ${warning}`));
  }

  pages.forEach((page, index) => {
    page.push(text(`Seite ${index + 1} von ${pages.length}`, 480, 28, 7));
    page.push(text(`Pruefsumme ${input.checksum.slice(0, 16)}`, margin, 28, 7));
  });
  return buildPdf(pages.map((page) => page.join("\n")));
}

function bankingSection(
  title: string,
  lines: NonNullable<ServiceChargeStatementSnapshot["source"]["bankingDetails"]>["allocableCosts"],
  write: (value: string, options?: { size?: number; bold?: boolean; indent?: number; gap?: number }) => void,
  ensure: (height?: number) => void,
  current: () => string[],
  getY: () => number,
  setY: (value: number) => void,
  unitName: (id: string) => string
) {
  write(title, { size: 12, bold: true, gap: 18 });
  if (!lines.length) {
    write("Keine Positionen.");
    return;
  }
  for (const line of lines) {
    ensure(55);
    let y = getY();
    current().push(text(
      `${date(line.value_date || line.booking_date)} | ${line.applicant_name || "Ohne Gegenpartei"}`,
      margin,
      y,
      8.5,
      true
    ));
    current().push(text(money(Number(line.amount || 0)), 475, y, 8.5, true));
    y -= 12;
    setY(y);
    write(`Zweck: ${line.purpose || line.memo || "-"}`, { indent: 10, size: 7.5, gap: 10 });
    write(
      `Buchung ${money(Number(line.transaction_amount || line.amount || 0))}`
      + ` | Split ${money(Number(line.amount || 0))}`
      + ` | Mieter ${line.tenant_external_id || "-"}`
      + ` | Einheit ${line.unit_external_id ? unitName(line.unit_external_id) : "Gesamtobjekt"}`,
      { indent: 10, size: 7.5, gap: 10 }
    );
    write(
      `Bank ${line.bank_name || "-"} / ${line.account_name || "-"}`
      + ` | Referenz ${line.bank_reference || line.customer_reference || "-"}`
      + ` | Kaltmiete ${line.contractual_cold_rent ? money(Number(line.contractual_cold_rent)) : "-"}`,
      { indent: 10, size: 7.5, gap: 10 }
    );
    setY(getY() - 5);
  }
}

function metric(rows: string[], label: string, value: number, x: number, y: number) {
  rows.push(text(label, x, y, 8));
  rows.push(text(money(value), x + 120, y, 9, true));
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
