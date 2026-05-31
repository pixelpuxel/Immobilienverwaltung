const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : null;
const dryRun = process.argv.includes("--dry-run");

function cleanText(text) {
  return (text || "")
    .replace(/\u0000/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return cleanText(match[1] || match[0]);
  }
  return null;
}

function extractEuroAmounts(text) {
  return unique([...text.matchAll(/\b-?\d{1,3}(?:\.\d{3})*,\d{2}\s*EUR\b|\b-?\d{1,3}(?:\.\d{3})*,\d{2}\s*€/g)].map((m) => m[0])).slice(0, 6);
}

function extractDates(text) {
  return unique([...text.matchAll(/\b\d{1,2}\.\d{1,2}\.\d{2,4}\b/g)].map((m) => m[0])).slice(0, 8);
}

function extractYears(text) {
  return unique([...text.matchAll(/\b(?:19|20)\d{2}\b/g)].map((m) => m[0])).slice(0, 8);
}

function periodFromText(text) {
  return firstMatch(text, [
    /(\d{1,2}\.\d{1,2}\.\d{2,4}\s*(?:bis|-|–)\s*\d{1,2}\.\d{1,2}\.\d{2,4})/i,
    /(Zeitraum[:\s]+[^\n]+)/i,
    /(Abrechnungszeitraum[:\s]+[^\n]+)/i,
  ]);
}

function extractTextWith(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: options.timeout || 45000,
    maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, HOME: "/tmp" },
  });
  if (result.status !== 0 && !result.stdout) return "";
  return cleanText(result.stdout || "");
}

function convertOfficeToText(filePath, mimeType) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "doc-summary-"));
  const target = mimeType.includes("spreadsheet") || mimeType.includes("excel") ? "csv" : "txt";
  try {
    spawnSync("libreoffice", ["--headless", "--convert-to", target, "--outdir", dir, filePath], {
      encoding: "utf8",
      timeout: 60000,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, HOME: "/tmp" },
    });
    const files = fs.readdirSync(dir).map((name) => path.join(dir, name));
    const converted = files.find((name) => name.endsWith(`.${target}`)) || files[0];
    if (!converted || !fs.existsSync(converted)) return "";
    return cleanText(fs.readFileSync(converted, "utf8"));
  } catch {
    return "";
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function extractText(doc) {
  if (!doc.storagePath || !fs.existsSync(doc.storagePath)) return "";
  if (doc.mimeType === "application/pdf") {
    return extractTextWith("pdftotext", ["-layout", "-f", "1", "-l", "12", doc.storagePath, "-"]);
  }
  if (doc.mimeType === "text/plain") {
    return cleanText(fs.readFileSync(doc.storagePath, "utf8"));
  }
  if (doc.mimeType.includes("word") || doc.mimeType.includes("excel") || doc.mimeType.includes("spreadsheet")) {
    return convertOfficeToText(doc.storagePath, doc.mimeType);
  }
  return "";
}

function contextLine(doc) {
  const parts = [doc.property?.name, doc.unit?.unitNumber].filter(Boolean);
  return parts.length ? parts.join(" / ") : null;
}

function compactLine(line, max = 120) {
  const value = cleanText(line).replace(/\s*:\s*/g, ": ");
  return value.length > max ? `${value.slice(0, max - 1).trim()}…` : value;
}

function titleText(doc) {
  return `${doc.title || ""} ${doc.filename || ""}`;
}

function splitCamelName(value) {
  return cleanText(value)
    .replace(/([a-zäöüß])([A-ZÄÖÜ])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function tenantFromTitle(doc) {
  const source = titleText(doc);
  const ignore = new Set(["Mietvertrag", "Musterstraße", "Demostr", "Beispielweg", "Sportstr", "Scan", "Wohnung", "Einheit"]);
  const rawTokens = source.split(/[^A-Za-zÄÖÜäöüß]+/).filter(Boolean);
  for (const token of rawTokens) {
    if (ignore.has(token)) continue;
    const camel = token.match(/^([A-ZÄÖÜ][a-zäöüß]+)([A-ZÄÖÜ][a-zäöüß]+)$/);
    if (camel) return `${camel[1]} ${camel[2]}`;
  }
  for (let index = 0; index < rawTokens.length - 1; index += 1) {
    const first = rawTokens[index];
    const second = rawTokens[index + 1];
    if (ignore.has(first) || ignore.has(second)) continue;
    if (/^[A-ZÄÖÜ][a-zäöüß]{2,}$/.test(first) && /^[A-ZÄÖÜ][a-zäöüß]{2,}$/.test(second)) {
      return `${first} ${second}`;
    }
  }
  return null;
}

function summarizeNebenkosten(doc, text) {
  const bullets = [];
  const period = periodFromText(text);
  const payer = firstMatch(text, [
    /Nebenkostenvorauszahlung[\s\S]{0,900}?(?:Musterbank|Sparkasse|Volksbank|Bank)\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß]+ [A-ZÄÖÜ][A-Za-zÄÖÜäöüß]+)/,
    /Nebenkostenvorauszahlung[\s\S]{0,900}?Empfänger\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß]+ [A-ZÄÖÜ][A-Za-zÄÖÜäöüß]+)/,
  ]);
  const prepay = firstMatch(text, [/Gesamt Nebenkostenvorauszahlung\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})/i]);
  const result = firstMatch(text, [/Gesamt Einnahmen\s*-\s*Ausgaben\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})/i, /Gesamtsumme\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})/i]);
  if (period) bullets.push(`Zeitraum: ${period.replace(/\s+/g, " ")}`);
  if (payer && !/Postbank|Sparkasse|Volksbank|Bank|München|Empfänger/i.test(payer)) bullets.push(`Mieter/Zahler: ${payer}`);
  if (prepay) bullets.push(`Nebenkostenvorauszahlungen: ${prepay} €`);
  const expenses = ["Abfall", "Grundsteuer", "Versicherung", "Wasser", "Abwasser", "Hausmeister", "Heizung"].filter((term) => new RegExp(term, "i").test(text));
  if (expenses.length) bullets.push(`Ausgaben u.a.: ${unique(expenses).join(", ")}`);
  if (result) bullets.push(`Ergebnis: ${result} €`);
  return bullets;
}

function summarizeGrundbuch(doc, text) {
  const bullets = [];
  const court = firstMatch(text, [/Amtsgericht[:\s]+([^\n]+)/i, /(Amtsgericht [A-ZÄÖÜ][^\n]+)/i]);
  const book = firstMatch(text, [/Grundbuch(?: von)?\s+([A-ZÄÖÜa-zäöüß -]+)\s+Nr\.?\s*([0-9.]+)/i]);
  const abruf = firstMatch(text, [/Datum des Abrufs[:\s]+(\d{1,2}\.\d{1,2}\.\d{4})/i]);
  const share = firstMatch(text, [/(\d+\/\d+\s+Miteigentumsanteil[^\n]+)/i]);
  const flurstueck = firstMatch(text, [/(?:Flurstück|Flst\.?|Flurstueck)?\s*(\d{3,5}\/?\d*)\s+([A-Za-zÄÖÜäöüß .-]+straße\s*\d+[^\n]*)/i]);
  const unit = firstMatch(text, [/(Wohneinheit\s+(?:im\s+)?[^\n.]+|Wohnungseigentum[^\n.]+)/i]);
  const cellar = firstMatch(text, [/(Keller\s*(?:Nr\.?)?\s*\d+)/i]);
  if (book) bullets.push(`Grundbuch: ${book}${abruf ? `, Abruf ${abruf}` : ""}`);
  else if (court || abruf) bullets.push(`Grundbuchauszug${court ? ` ${court}` : ""}${abruf ? `, Abruf ${abruf}` : ""}`);
  if (share) bullets.push(`Anteil: ${share}`);
  if (flurstueck) bullets.push(`Grundstück/Flurstück: ${flurstueck}`);
  if (unit) bullets.push(`Einheit: ${unit}`);
  if (cellar) bullets.push(`Zugehörig: ${cellar}`);
  return bullets;
}

function summarizeMietvertrag(doc, text) {
  const bullets = [];
  const tenant = firstMatch(text, [/Mieter(?:in)?[:\s]+([^\n]+)/i, /zwischen[\s\S]{0,500}?und\s+([A-ZÄÖÜ][^\n,]+)\s*,\s*(?:geboren|geb\.)/i]);
  const start = firstMatch(text, [/(?:Mietbeginn|Beginn des Mietverhältnisses|Mietverhältnis beginnt)[^\d]*(\d{1,2}\.\d{1,2}\.\d{4})/i]);
  const rent = firstMatch(text, [/(?:Kaltmiete|Grundmiete|Nettomiete)[^\d]*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\s*(?:EUR|€)?/i]);
  const charges = firstMatch(text, [/(?:Nebenkosten|Betriebskosten)[^\d]*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\s*(?:EUR|€)?/i]);
  const deposit = firstMatch(text, [/(?:Kaution|Mietsicherheit)[^\d]*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\s*(?:EUR|€)?/i]);
  const cleanTenant = tenant && !/^und$/i.test(tenant) ? tenant : tenantFromTitle(doc);
  if (cleanTenant) bullets.push(`Mieter: ${compactLine(cleanTenant)}`);
  if (start) bullets.push(`Mietbeginn: ${start}`);
  if (rent) bullets.push(`Kaltmiete: ${rent} €`);
  if (charges) bullets.push(`Nebenkosten/Betriebskosten: ${charges} €`);
  if (deposit) bullets.push(`Kaution: ${deposit} €`);
  return bullets;
}

function summarizeGeneric(doc, text) {
  const bullets = [];
  const category = doc.category?.name;
  const ctx = contextLine(doc);
  if (category) bullets.push(`Dokumentart: ${category}`);
  if (ctx) bullets.push(`Bezug: ${ctx}`);
  const period = periodFromText(text);
  if (period) bullets.push(`Zeitraum: ${period}`);
  const dates = extractDates(text);
  if (dates.length) bullets.push(`Datumsangaben: ${dates.slice(0, 4).join(", ")}`);
  const amounts = extractEuroAmounts(text);
  if (amounts.length) bullets.push(`Beträge: ${amounts.slice(0, 4).join(", ")}`);
  const lines = cleanText(text)
    .split("\n")
    .map((line) => compactLine(line))
    .filter((line) => line.length > 35 && !/^\d+$/.test(line))
    .filter((line) => !/^[_\-. ]+$/.test(line))
    .filter((line) => !/Max Eigentümer\s+l\s+Eigentümerweg/i.test(line));
  for (const line of lines.slice(0, 2)) bullets.push(`Inhalt: ${line}`);
  const years = extractYears(`${doc.title} ${doc.filename} ${text}`);
  if (!period && !dates.length && years.length) bullets.push(`Jahre/Bezug: ${years.slice(0, 4).join(", ")}`);
  return bullets;
}

function fallbackSummary(doc, reason) {
  const bullets = [];
  if (doc.category?.name) bullets.push(`Dokumentart: ${doc.category.name}`);
  const ctx = contextLine(doc);
  if (ctx) bullets.push(`Bezug: ${ctx}`);
  if (/Grundbuch/i.test(titleText(doc))) {
    const part = firstMatch(titleText(doc), [/[-_ ](Wohnung|Tiefgarage|Garage|1\.OG links|1\.OG rechts|DG|OL|OR)(?:\.pdf|$)/i]);
    bullets.push(`Inhalt: Grundbuchauszug${part ? ` (${part})` : ""}${ctx ? ` zu ${ctx}` : ` zu ${doc.title}`}`);
  } else if (/Mietvertrag/i.test(titleText(doc))) {
    const tenant = tenantFromTitle(doc);
    bullets.push(`Inhalt: Mietvertrag${tenant ? ` fuer ${tenant}` : ""}`);
  } else if (/Versicherung/i.test(titleText(doc))) {
    bullets.push("Inhalt: Versicherungsnachweis bzw. Versicherungsunterlagen");
  } else if (/Nebenkosten|Abrechnung/i.test(titleText(doc))) {
    bullets.push("Inhalt: Abrechnung/Nebenkostenunterlage");
  } else if (doc.mimeType.startsWith("image/")) {
    bullets.push("Datei: Bild/Fotodokument, keine Textextraktion moeglich");
  } else {
    bullets.push(`Datei: ${reason || "kein auslesbarer Text gefunden"}`);
  }
  const years = extractYears(`${doc.title} ${doc.filename}`);
  if (years.length) bullets.push(`Jahre/Bezug: ${years.slice(0, 4).join(", ")}`);
  return bullets;
}

function makeSummary(doc, text) {
  const haystack = `${doc.title}\n${doc.filename}\n${doc.category?.name || ""}\n${text}`;
  let bullets = [];
  if (/Mietvertrag|Mietvertraege|Mietverträge/i.test(haystack)) bullets = summarizeMietvertrag(doc, text);
  else if (/Nebenkostenabrechnung|Betriebskostenabrechnung|Abrechnung/i.test(haystack)) bullets = summarizeNebenkosten(doc, text);
  else if (/Grundbuch/i.test(haystack)) bullets = summarizeGrundbuch(doc, text);
  if (bullets.length < 2 && text.length > 30) bullets = unique([...bullets, ...summarizeGeneric(doc, text)]).slice(0, 6);
  if (!bullets.length) bullets = fallbackSummary(doc, text ? "Text konnte nicht sinnvoll zusammengefasst werden" : "kein auslesbarer Text gefunden");
  return bullets.slice(0, 6).map((line) => `- ${line}`).join("\n");
}

async function main() {
  const docs = await prisma.document.findMany({
    orderBy: { createdAt: "asc" },
    take: limit || undefined,
    include: { category: true, property: true, unit: true },
  });
  let updated = 0;
  let extracted = 0;
  let fallback = 0;
  for (const doc of docs) {
    const text = extractText(doc);
    if (text.length > 30) extracted += 1;
    else fallback += 1;
    const summary = makeSummary(doc, text);
    if (dryRun) {
      console.log(`\n${doc.title}\n${summary}`);
    } else {
      await prisma.document.update({ where: { id: doc.id }, data: { summary } });
    }
    updated += 1;
    if (updated % 50 === 0) console.log(`${updated}/${docs.length} verarbeitet`);
  }
  console.log(JSON.stringify({ dryRun, processed: updated, extracted, fallback }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
