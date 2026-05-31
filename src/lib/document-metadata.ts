type MetadataDocument = {
  title: string;
  filename: string;
  mimeType?: string | null;
  createdAt?: Date | string | null;
  property?: { name: string } | null;
  unit?: { unitNumber: string; property?: { name: string } | null } | null;
  category?: { group: string; name: string } | null;
};

const keywordRules: Array<[RegExp, string[]]> = [
  [/mietvertrag|vertrag/i, ["Mietvertrag", "Miete"]],
  [/nebenkosten|betriebskosten|abrechnung/i, ["Nebenkosten", "Abrechnung"]],
  [/grundbuch/i, ["Grundbuch", "Eigentum"]],
  [/energieausweis|energie/i, ["Energieausweis"]],
  [/grundriss|plan/i, ["Grundriss", "Plan"]],
  [/versicherung/i, ["Versicherung"]],
  [/kaution/i, ["Kaution"]],
  [/uebergabe|übergabe/i, ["Übergabe"]],
  [/foto|bild|img|jpg|jpeg|png/i, ["Foto"]],
  [/darlehen|finanzierung/i, ["Finanzierung"]],
  [/steuer|grundsteuer/i, ["Steuer"]],
  [/protokoll|versammlung|beschluss/i, ["WEG"]],
  [/wohnungsgeber/i, ["Wohnungsgeberbestätigung"]]
];

export function buildDocumentMetadata(document: MetadataDocument) {
  const category = document.category ? `${document.category.group} / ${document.category.name}` : "ohne Kategorie";
  const propertyName = document.property?.name || document.unit?.property?.name || null;
  const unitName = document.unit?.unitNumber || null;
  const year = extractDocumentYear(document.title, document.filename) || extractDateYear(document.createdAt);
  const fileType = readableFileType(document.mimeType, document.filename);
  const tags = unique([
    document.category?.group,
    document.category?.name,
    year,
    fileType,
    ...keywordTags(`${document.title} ${document.filename} ${category}`)
  ].filter(Boolean) as string[]).slice(0, 8);
  const location = [propertyName, unitName].filter(Boolean).join(" / ");
  const summaryParts = [
    `${fileType} aus dem Bereich ${category}`,
    location ? `zu ${location}` : null,
    year ? `mit Bezug auf ${year}` : null
  ].filter(Boolean);
  return {
    summary: `${summaryParts.join(" ")}.`,
    tags
  };
}

export function extractDocumentYear(title: string, filename: string) {
  const text = `${title} ${filename}`;
  const compactDateMatch = text.match(/(?:^|[^0-9])((?:19[5-9]\d|20[0-4]\d))[01]\d[0-3]\d(?:[^0-9]|$)/);
  if (compactDateMatch?.[1]) return compactDateMatch[1];
  const match = text.match(/\b(19[5-9]\d|20[0-4]\d)\b/);
  return match?.[1] || null;
}

function extractDateYear(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? String(date.getFullYear()) : null;
}

function readableFileType(mimeType: string | null | undefined, filename: string) {
  const lower = filename.toLowerCase();
  if (mimeType?.includes("pdf") || lower.endsWith(".pdf")) return "PDF";
  if (mimeType?.includes("word") || lower.endsWith(".docx") || lower.endsWith(".doc")) return "Word-Dokument";
  if (mimeType?.startsWith("image/") || /\.(jpe?g|png|webp|gif)$/i.test(filename)) return "Bild";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "Excel-Datei";
  return "Dokument";
}

function keywordTags(text: string) {
  return keywordRules.flatMap(([pattern, tags]) => pattern.test(text) ? tags : []);
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
