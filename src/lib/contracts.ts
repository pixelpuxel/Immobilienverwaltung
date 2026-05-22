import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { env } from "./env";
import { safeFilename } from "./files";
import { prisma } from "./prisma";

const execFileAsync = promisify(execFile);

export const contractPlaceholders = [
  "tenant_name",
  "tenant_first_name",
  "tenant_last_name",
  "tenant_birthdate",
  "tenant_current_address",
  "tenant_phone",
  "tenant_email",
  "property_address",
  "property_name",
  "unit_number",
  "room_description",
  "shared_rooms",
  "rent_amount",
  "service_charges",
  "warm_rent",
  "deposit",
  "rent_due_day",
  "landlord_bank_name",
  "landlord_bank_account",
  "lease_start_date",
  "move_in_date",
  "occupant_count",
  "stepped_rent",
  "contract_notes",
  "special_agreements"
];

export async function generateContract(input: { tenantProfileId: string; unitId: string; templateId?: string | null }) {
  const tenant = await prisma.tenantProfile.findUniqueOrThrow({ where: { id: input.tenantProfileId } });
  const unit = await prisma.unit.findUniqueOrThrow({ where: { id: input.unitId }, include: { property: true } });
  const template = input.templateId
    ? await prisma.contractTemplate.findUnique({ where: { id: input.templateId } })
    : null;

  await fs.mkdir(env.contractsPath, { recursive: true });
  const baseName = contractBaseName(tenant, unit);
  const docxPath = path.join(env.contractsPath, `${baseName}.docx`);
  const pdfPath = path.join(env.contractsPath, `${baseName}.pdf`);

  if (template?.storagePath) {
    const content = await fs.readFile(template.storagePath);
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
    doc.render(contractData(tenant, unit));
    await fs.writeFile(docxPath, doc.getZip().generate({ type: "nodebuffer" }));
  } else {
    const zip = new PizZip();
    zip.file("[Content_Types].xml", contentTypesXml());
    zip.folder("_rels")?.file(".rels", relsXml());
    zip.folder("word")?.file("document.xml", defaultContractXml(contractData(tenant, unit)));
    zip.folder("word")?.folder("_rels")?.file("document.xml.rels", "");
    await fs.writeFile(docxPath, zip.generate({ type: "nodebuffer" }));
  }

  try {
    await execFileAsync("libreoffice", ["--headless", "--convert-to", "pdf", "--outdir", env.contractsPath, docxPath], {
      timeout: 60_000
    });
  } catch {
    return { docxPath, pdfPath: null };
  }

  return { docxPath, pdfPath };
}

function contractBaseName(tenant: ContractTenant, unit: ContractUnit) {
  const stamp = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date()).replace(", ", "-").replace(/\./g, "-").replace(/:/g, "_");
  return safeFilename(`Mietvertrag_${unit.property.name}_${unit.unitNumber}_${tenant.firstName}${tenant.lastName}-${stamp}`);
}

function formatDate(value?: Date | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("de-DE").format(value);
}

function money(value: unknown) {
  if (value === null || value === undefined) return "";
  return `${Number(value).toFixed(2)} EUR`;
}

type ContractTenant = {
  firstName: string;
  lastName: string;
  birthdate: Date | null;
  currentAddress: string | null;
  phone: string | null;
  email: string;
  rentAmount: unknown;
  serviceCharges: unknown;
  deposit: unknown;
  rentDueDay: number | null;
  landlordBankName: string | null;
  landlordBankAccount: string | null;
  leaseStartDate: Date | null;
  moveInDate: Date | null;
  occupantCount: number | null;
  roomDescription: string | null;
  sharedRooms: string | null;
  steppedRent: string | null;
  contractNotes: string | null;
  specialAgreements: string | null;
  pets: string | null;
};

type ContractUnit = {
  unitNumber: string;
  rentAmount: unknown;
  serviceCharges: unknown;
  warmRent: unknown;
  property: { name: string; address: string };
};

function contractData(tenant: ContractTenant, unit: ContractUnit) {
  const serviceCharges = tenant.serviceCharges ?? unit.serviceCharges;
  const rentAmount = tenant.rentAmount ?? unit.rentAmount;
  const warmRent = unit.warmRent ?? (rentAmount && serviceCharges ? Number(rentAmount) + Number(serviceCharges) : null);
  return {
    tenant_name: `${tenant.firstName} ${tenant.lastName}`,
    tenant_first_name: tenant.firstName,
    tenant_last_name: tenant.lastName,
    tenant_birthdate: formatDate(tenant.birthdate),
    tenant_current_address: tenant.currentAddress || "",
    tenant_phone: tenant.phone || "",
    tenant_email: tenant.email,
    property_name: unit.property.name,
    property_address: unit.property.address,
    unit_number: unit.unitNumber,
    room_description: tenant.roomDescription || `Einheit ${unit.unitNumber}`,
    shared_rooms: tenant.sharedRooms || "Gemeinschaftlich nutzbare Räume nach Vereinbarung.",
    rent_amount: money(rentAmount),
    service_charges: money(serviceCharges),
    warm_rent: money(warmRent),
    deposit: money(tenant.deposit),
    rent_due_day: tenant.rentDueDay ? String(tenant.rentDueDay) : "1",
    landlord_bank_name: tenant.landlordBankName || "",
    landlord_bank_account: tenant.landlordBankAccount || "",
    lease_start_date: formatDate(tenant.leaseStartDate),
    move_in_date: formatDate(tenant.moveInDate),
    occupant_count: tenant.occupantCount ? String(tenant.occupantCount) : "1",
    stepped_rent: tenant.steppedRent || "",
    contract_notes: tenant.contractNotes || "",
    special_agreements: tenant.specialAgreements || "",
    pets: tenant.pets || ""
  };
}

function contentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
}

function relsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
}

function defaultContractXml(values: Record<string, string>) {
  const rows = [
    ["Mieter", values.tenant_name],
    ["Geburtsdatum", values.tenant_birthdate || "noch zu ergänzen"],
    ["Aktuelle Anschrift", values.tenant_current_address],
    ["Telefon", values.tenant_phone],
    ["E-Mail", values.tenant_email],
    ["Objekt", values.property_address],
    ["Einheit", values.unit_number],
    ["Mietgegenstand", values.room_description],
    ["Mitbenutzte Räume", values.shared_rooms],
    ["Kaltmiete", values.rent_amount],
    ["Nebenkosten", values.service_charges],
    ["Monatliche Gesamtmiete", values.warm_rent],
    ["Kaution", values.deposit],
    ["Zahlbar bis zum Werktag", values.rent_due_day],
    ["Mietbeginn", values.lease_start_date],
    ["Einzug", values.move_in_date],
    ["Anzahl Bewohner", values.occupant_count]
  ];
  const sections = [
    heading("Mietvertrag für Wohnraum"),
    paragraph("Zwischen dem Vermieter und dem unten genannten Mieter wird folgender Mietvertrag geschlossen."),
    heading("1. Vertragsparteien"),
    ...rows.slice(0, 5).map(([label, value]) => paragraph(`${label}: ${value}`)),
    heading("2. Mietgegenstand"),
    ...rows.slice(5, 9).map(([label, value]) => paragraph(`${label}: ${value}`)),
    paragraph("Der Mietgegenstand wird ausschließlich zu Wohnzwecken überlassen. Eine Aufnahme weiterer Personen oder eine Untervermietung bedarf der vorherigen schriftlichen Zustimmung des Vermieters."),
    heading("3. Miete, Betriebskosten und Zahlung"),
    ...rows.slice(9, 14).map(([label, value]) => paragraph(`${label}: ${value}`)),
    paragraph(`Die Miete einschließlich der Betriebskostenvorauszahlung ist spätestens am ${values.rent_due_day || "1"}. Werktag des jeweiligen Monats im Voraus zu zahlen.`),
    values.landlord_bank_account ? paragraph(`Zahlungskonto: ${values.landlord_bank_name} ${values.landlord_bank_account}`) : "",
    heading("4. Mietzeit"),
    ...rows.slice(14, 17).map(([label, value]) => paragraph(`${label}: ${value}`)),
    paragraph("Die gesetzlichen Kündigungsfristen gelten, soweit keine abweichende schriftliche Vereinbarung getroffen wurde."),
    heading("5. Staffelmiete"),
    values.stepped_rent ? multiline(values.stepped_rent) : paragraph("Keine Staffelmiete hinterlegt."),
    heading("6. Nutzung, Gemeinschaftsflächen und Pflichten"),
    paragraph("Der Mieter verpflichtet sich zu sorgfältiger Nutzung der Mieträume, Rücksichtnahme auf Mitbewohner und Nachbarn sowie zur Einhaltung der Hausordnung."),
    paragraph("Änderungen an der Belegung, Schäden und meldepflichtige Umstände sind dem Vermieter unverzüglich mitzuteilen."),
    heading("7. Besondere Vereinbarungen"),
    values.special_agreements ? multiline(values.special_agreements) : paragraph("Keine besonderen Vereinbarungen hinterlegt."),
    values.contract_notes ? multiline(values.contract_notes) : "",
    heading("8. Unterschriften"),
    paragraph("Ort, Datum: ______________________________________________"),
    paragraph("Mieter: _________________________________________________"),
    paragraph("Vermieter: ______________________________________________")
  ].join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${sections}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`;
}

function heading(text: string) {
  return paragraph(text, true);
}

function multiline(text: string) {
  return text.split(/\r?\n/).filter(Boolean).map((line) => paragraph(line)).join("");
}

function paragraph(text: string, bold = false) {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<w:p><w:r>${bold ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t>${escaped}</w:t></w:r></w:p>`;
}
