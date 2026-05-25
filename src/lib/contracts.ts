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
  "garage_rent",
  "cold_rent_total",
  "service_charges",
  "warm_rent",
  "deposit",
  "rent_due_day",
  "landlord_bank_name",
  "landlord_bank_account",
  "owner_name",
  "owner_address",
  "owner_phone",
  "owner_email",
  "owner_bank_name",
  "owner_iban",
  "owner_tax_id",
  "owner_notes",
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
  const owner = await prisma.user.findFirst({ where: { role: "ADMIN", active: true, portalInstanceId: unit.property.portalInstanceId }, orderBy: { createdAt: "asc" } });

  await fs.mkdir(env.contractsPath, { recursive: true });
  const baseName = contractBaseName(tenant, unit);
  const docxPath = path.join(env.contractsPath, `${baseName}.docx`);
  const pdfPath = path.join(env.contractsPath, `${baseName}.pdf`);

  if (template?.storagePath) {
    const content = await fs.readFile(template.storagePath);
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, delimiters: { start: "{{", end: "}}" } });
    doc.render(contractData(tenant, unit, owner));
    await fs.writeFile(docxPath, doc.getZip().generate({ type: "nodebuffer" }));
  } else {
    const zip = new PizZip();
    zip.file("[Content_Types].xml", contentTypesXml());
    zip.folder("_rels")?.file(".rels", relsXml());
    zip.folder("word")?.file("document.xml", defaultContractXml(contractData(tenant, unit, owner)));
    zip.folder("word")?.folder("_rels")?.file("document.xml.rels", documentRelsXml());
    await fs.writeFile(docxPath, zip.generate({ type: "nodebuffer" }));
  }

  try {
    await execFileAsync("libreoffice", ["--headless", "--convert-to", "pdf", "--outdir", env.contractsPath, docxPath], {
      timeout: 60_000
    });
    await fs.access(pdfPath);
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
  garageRent: unknown;
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
  garageRent: unknown;
  serviceCharges: unknown;
  warmRent: unknown;
  property: { name: string; address: string };
};

type ContractOwner = {
  name: string | null;
  email: string;
  contactPerson: string | null;
  contactAddress: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  ownerBankName: string | null;
  ownerIban: string | null;
  ownerTaxId: string | null;
  ownerNotes: string | null;
} | null;

function contractData(tenant: ContractTenant, unit: ContractUnit, owner: ContractOwner) {
  const serviceCharges = tenant.serviceCharges ?? unit.serviceCharges;
  const rentAmount = tenant.rentAmount ?? unit.rentAmount;
  const garageRent = tenant.garageRent ?? unit.garageRent;
  const coldRentTotal = amount(rentAmount) + amount(garageRent);
  const warmRent = coldRentTotal || serviceCharges ? coldRentTotal + amount(serviceCharges) : null;
  const ownerName = owner?.contactPerson || owner?.name || "";
  const ownerBankName = owner?.ownerBankName || tenant.landlordBankName || "";
  const ownerIban = owner?.ownerIban || tenant.landlordBankAccount || "";
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
    garage_rent: money(garageRent),
    cold_rent_total: money(coldRentTotal),
    service_charges: money(serviceCharges),
    warm_rent: money(warmRent),
    deposit: money(tenant.deposit),
    rent_due_day: tenant.rentDueDay ? String(tenant.rentDueDay) : "1",
    landlord_bank_name: ownerBankName,
    landlord_bank_account: ownerIban,
    owner_name: ownerName,
    owner_address: owner?.contactAddress || "",
    owner_phone: owner?.contactPhone || "",
    owner_email: owner?.contactEmail || owner?.email || "",
    owner_bank_name: ownerBankName,
    owner_iban: ownerIban,
    owner_tax_id: owner?.ownerTaxId || "",
    owner_notes: owner?.ownerNotes || "",
    lease_start_date: formatDate(tenant.leaseStartDate),
    move_in_date: formatDate(tenant.moveInDate),
    occupant_count: tenant.occupantCount ? String(tenant.occupantCount) : "1",
    stepped_rent: tenant.steppedRent || "",
    contract_notes: tenant.contractNotes || "",
    special_agreements: tenant.specialAgreements || "",
    pets: tenant.pets || ""
  };
}

function amount(value: unknown) {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

function documentRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;
}

function defaultContractXml(values: Record<string, string>) {
  const rows = [
    ["Vermieter", values.owner_name],
    ["Vermieter-Anschrift", values.owner_address],
    ["Vermieter-Kontakt", [values.owner_phone, values.owner_email].filter(Boolean).join(" · ")],
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
    ["Tiefgarage", values.garage_rent],
    ["Kaltmiete inkl. Tiefgarage", values.cold_rent_total],
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
    ...rows.slice(0, 8).map(([label, value]) => paragraph(`${label}: ${value}`)),
    heading("2. Mietgegenstand"),
    ...rows.slice(8, 12).map(([label, value]) => paragraph(`${label}: ${value}`)),
    paragraph("Der Mietgegenstand wird ausschließlich zu Wohnzwecken überlassen. Eine Aufnahme weiterer Personen oder eine Untervermietung bedarf der vorherigen schriftlichen Zustimmung des Vermieters."),
    heading("3. Miete, Betriebskosten und Zahlung"),
    ...rows.slice(12, 18).map(([label, value]) => paragraph(`${label}: ${value}`)),
    paragraph(`Die Miete einschließlich der Betriebskostenvorauszahlung ist spätestens am ${values.rent_due_day || "1"}. Werktag des jeweiligen Monats im Voraus zu zahlen.`),
    values.landlord_bank_account ? paragraph(`Zahlungskonto: ${values.landlord_bank_name} ${values.landlord_bank_account}`) : "",
    heading("4. Mietzeit"),
    ...rows.slice(19, 22).map(([label, value]) => paragraph(`${label}: ${value}`)),
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
