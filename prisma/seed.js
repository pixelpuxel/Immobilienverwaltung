const { PrismaClient, Role, DocumentStatus } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");

const prisma = new PrismaClient();

const categories = {
  Allgemein: [
    "Grundbuchauszug",
    "Flurkarte",
    "Lageplan",
    "Grundrisse",
    "Wohnflächenberechnung",
    "Bauakte",
    "Energieausweis",
    "Baubeschreibung",
    "Gutachten",
    "Versicherungsunterlagen",
    "Fotos",
    "Exposé"
  ],
  WEG: [
    "Teilungserklärung",
    "Aufteilungsplan",
    "Wirtschaftsplan",
    "Hausgeldabrechnungen",
    "Eigentümerversammlungsprotokolle",
    "Rücklagenübersicht",
    "Beschlusssammlung"
  ],
  Vermietung: [
    "Mietverträge",
    "Mieterliste",
    "Nebenkostenabrechnungen",
    "Kautionsnachweise",
    "Übergabeprotokolle",
    "Ertragsnachweise",
    "Wohnungsgeberbestätigung"
  ]
};

const tenantVisibleCategories = new Set([
  "Mietverträge",
  "Nebenkostenabrechnungen",
  "Kautionsnachweise",
  "Übergabeprotokolle",
  "Wohnungsgeberbestätigung"
]);

const brokerHiddenCategories = new Set([
  "Wohnungsgeberbestätigung"
]);

async function main() {
  const email = process.env.ADMIN_EMAIL || "admin@meinedomain.de";
  const password = process.env.ADMIN_PASSWORD || "bitte_aendern";
  const passwordHash = await bcrypt.hash(password, 12);
  const defaultPortal = await prisma.portalInstance.upsert({
    where: { slug: "default" },
    update: { name: "Eigene Immobilienverwaltung" },
    create: { name: "Eigene Immobilienverwaltung", slug: "default" }
  });

  await prisma.user.upsert({
    where: { email },
    update: {
      portalInstanceId: defaultPortal.id,
      platformAdmin: true,
      username: "eigentuemer",
      passwordHash,
      role: Role.ADMIN,
      active: true,
      name: "Eigentümer",
      contactPerson: "Gabriel Schreiber",
      contactEmail: email
    },
    create: {
      email,
      portalInstanceId: defaultPortal.id,
      platformAdmin: true,
      username: "eigentuemer",
      name: "Eigentümer",
      contactPerson: "Gabriel Schreiber",
      contactEmail: email,
      passwordHash,
      role: Role.ADMIN,
      active: true
    }
  });

  for (const [group, names] of Object.entries(categories)) {
    for (const name of names) {
      await prisma.documentCategory.upsert({
        where: { name },
        update: {
          group,
          visibleToBroker: !brokerHiddenCategories.has(name),
          visibleToTenant: tenantVisibleCategories.has(name)
        },
        create: {
          group,
          name,
          visibleToBroker: !brokerHiddenCategories.has(name),
          visibleToTenant: tenantVisibleCategories.has(name)
        }
      });
    }
  }

  const propertyCount = await prisma.property.count();
  if (propertyCount === 0) {
    const property = await prisma.property.create({
      data: {
        portalInstanceId: defaultPortal.id,
        name: "Musterobjekt Innenstadt",
        address: "Beispielstraße 12, 78462 Konstanz",
        objectType: "Mehrfamilienhaus",
        constructionYear: 1998,
        livingArea: 420,
        unitCount: 4,
        rentalStatus: "teilvermietet",
        internalNotes: "Demo-Objekt für den ersten Start."
      }
    });

    await prisma.unit.createMany({
      data: [
        { propertyId: property.id, unitNumber: "EG-1", floor: "EG", rooms: 3, livingArea: 92, rentAmount: 1250, status: "vermietet" },
        { propertyId: property.id, unitNumber: "OG-2", floor: "1. OG", rooms: 2, livingArea: 68, rentAmount: 980, status: "frei" }
      ]
    });

    const cat = await prisma.documentCategory.findUnique({ where: { name: "Grundbuchauszug" } });
    if (cat) {
      await prisma.document.create({
        data: {
          title: "Grundbuchauszug",
          filename: "noch-nicht-hochgeladen.txt",
          mimeType: "text/plain",
          size: 0,
          storagePath: "",
          status: DocumentStatus.MISSING,
          propertyId: property.id,
          categoryId: cat.id,
          uploadedById: (await prisma.user.findUniqueOrThrow({ where: { email } })).id
        }
      });
    }
  }

  await prisma.user.updateMany({ where: { portalInstanceId: null }, data: { portalInstanceId: defaultPortal.id } });
  await prisma.property.updateMany({ where: { portalInstanceId: null }, data: { portalInstanceId: defaultPortal.id } });
  await prisma.document.updateMany({ where: { portalInstanceId: null }, data: { portalInstanceId: defaultPortal.id } });
  await prisma.contractTemplate.updateMany({ where: { portalInstanceId: null }, data: { portalInstanceId: defaultPortal.id } });
  await prisma.auditLog.updateMany({ where: { portalInstanceId: null }, data: { portalInstanceId: defaultPortal.id } });

  await prisma.user.deleteMany({
    where: {
      OR: [
        { email: "makler@meinedomain.de", name: "Demo Makler" },
        { email: "mieter@meinedomain.de", name: "Demo Mieter" }
      ]
    }
  });

  const tirolergasse = await prisma.property.findFirst({
    where: { address: { contains: "Tirolergasse 14" } }
  });
  const tirolergasseUnit = tirolergasse
    ? await prisma.unit.findFirst({
        where: { propertyId: tirolergasse.id, unitNumber: { contains: "1. OG" } }
      })
    : null;

  if (tirolergasse && tirolergasseUnit) {
    await prisma.unit.update({
      where: { id: tirolergasseUnit.id },
      data: {
        livingArea: 18.4,
        rentAmount: 434,
        garageRent: 0,
        serviceCharges: 140,
        warmRent: 574,
        status: "vermietet"
      }
    });

    const jonasUser = await prisma.user.upsert({
      where: { email: "jonas.dittmann98@gmail.com" },
      update: {
        name: "Jonas Dittmann",
        role: Role.TENANT,
        active: true
      },
      create: {
        email: "jonas.dittmann98@gmail.com",
        name: "Jonas Dittmann",
        role: Role.TENANT,
        active: true,
        passwordHash: await bcrypt.hash("BitteSofortAendern123!", 12)
      }
    });

    const jonasProfile = await prisma.tenantProfile.upsert({
      where: { userId: jonasUser.id },
      update: {
        unitId: tirolergasseUnit.id,
        firstName: "Jonas",
        lastName: "Dittmann",
        birthdate: null,
        currentAddress: "Sankt-Gebhard-Straße 26, 78467 Konstanz",
        phone: "017620497753",
        email: "jonas.dittmann98@gmail.com",
        moveInDate: new Date("2025-10-01T00:00:00.000Z"),
        moveOutDate: null,
        isCurrent: true,
        leaseStartDate: new Date("2025-10-01T00:00:00.000Z"),
        rentAmount: 434,
        garageRent: 0,
        serviceCharges: 140,
        deposit: 1148,
        occupantCount: 1,
        rentDueDay: 1,
        landlordBankName: "Postbank München",
        landlordBankAccount: "DE52 7001 0080 0030 9988 07",
        roomDescription: "Zimmer im ersten Obergeschoss im Haus Tirolergasse 14, 78462 Konstanz; Wohnfläche für Berechnungszwecke 18,40 m².",
        sharedRooms: "Küche, Flur, Bad mit Toilette und Badewanne sowie Heizraum zum Aufstellen von Waschmaschine und Trockner können mitbenutzt werden.",
        steppedRent: [
          "01.07.2025 bis 30.06.2026: 434,00 EUR",
          "01.07.2026 bis 30.06.2027: 448,00 EUR",
          "01.07.2027 bis 30.06.2028: 462,00 EUR",
          "01.07.2028 bis 30.06.2029: 476,00 EUR",
          "01.07.2029 bis 30.06.2030: 491,00 EUR",
          "01.07.2030 bis 30.06.2031: 506,00 EUR",
          "01.07.2031 bis 30.06.2032: 522,00 EUR",
          "01.07.2032 bis 30.06.2033: 538,00 EUR",
          "01.07.2033 bis 30.06.2034: 555,00 EUR",
          "01.07.2034 bis 30.06.2035: 572,00 EUR",
          "01.07.2035 bis 30.06.2036: 590,00 EUR",
          "01.07.2036 bis 30.06.2037: 608,00 EUR"
        ].join("\n"),
        contractNotes: "Geburtsdatum im Vertrag ist mit 'fehlt noch' markiert und muss ergänzt werden. Die erste Miete inklusive Nebenkostenvorauszahlung sowie die Kaution sind vor Vertragsabschluss zu entrichten.",
        specialAgreements: [
          "Das Mietobjekt wird im Wohnbereich als Wohngemeinschaft genutzt.",
          "Nebenkosten werden gemäß Gesamtzahl der Mieter anteilig auf die Mieter umgelegt.",
          "Bei Mieterwechsel in der Wohngemeinschaft haben die übrigen Mitbewohner ein Mitspracherecht.",
          "Wäsche ist nicht in den Wohnräumen zu trocknen; Räume sind ausreichend zu lüften.",
          "Bei Auszug sind die Räume renoviert zu übergeben.",
          "Die Staffelmiete erhöht sich bereits am 01.07.2026, da die Konditionen des Vormieters übernommen werden."
        ].join("\n")
      },
      create: {
        userId: jonasUser.id,
        unitId: tirolergasseUnit.id,
        firstName: "Jonas",
        lastName: "Dittmann",
        birthdate: null,
        currentAddress: "Sankt-Gebhard-Straße 26, 78467 Konstanz",
        phone: "017620497753",
        email: "jonas.dittmann98@gmail.com",
        moveInDate: new Date("2025-10-01T00:00:00.000Z"),
        moveOutDate: null,
        isCurrent: true,
        leaseStartDate: new Date("2025-10-01T00:00:00.000Z"),
        rentAmount: 434,
        garageRent: 0,
        serviceCharges: 140,
        deposit: 1148,
        occupantCount: 1,
        rentDueDay: 1,
        landlordBankName: "Postbank München",
        landlordBankAccount: "DE52 7001 0080 0030 9988 07",
        roomDescription: "Zimmer im ersten Obergeschoss im Haus Tirolergasse 14, 78462 Konstanz; Wohnfläche für Berechnungszwecke 18,40 m².",
        sharedRooms: "Küche, Flur, Bad mit Toilette und Badewanne sowie Heizraum zum Aufstellen von Waschmaschine und Trockner können mitbenutzt werden.",
        steppedRent: [
          "01.07.2025 bis 30.06.2026: 434,00 EUR",
          "01.07.2026 bis 30.06.2027: 448,00 EUR",
          "01.07.2027 bis 30.06.2028: 462,00 EUR",
          "01.07.2028 bis 30.06.2029: 476,00 EUR",
          "01.07.2029 bis 30.06.2030: 491,00 EUR",
          "01.07.2030 bis 30.06.2031: 506,00 EUR",
          "01.07.2031 bis 30.06.2032: 522,00 EUR",
          "01.07.2032 bis 30.06.2033: 538,00 EUR",
          "01.07.2033 bis 30.06.2034: 555,00 EUR",
          "01.07.2034 bis 30.06.2035: 572,00 EUR",
          "01.07.2035 bis 30.06.2036: 590,00 EUR",
          "01.07.2036 bis 30.06.2037: 608,00 EUR"
        ].join("\n"),
        contractNotes: "Geburtsdatum im Vertrag ist mit 'fehlt noch' markiert und muss ergänzt werden. Die erste Miete inklusive Nebenkostenvorauszahlung sowie die Kaution sind vor Vertragsabschluss zu entrichten.",
        specialAgreements: [
          "Das Mietobjekt wird im Wohnbereich als Wohngemeinschaft genutzt.",
          "Nebenkosten werden gemäß Gesamtzahl der Mieter anteilig auf die Mieter umgelegt.",
          "Bei Mieterwechsel in der Wohngemeinschaft haben die übrigen Mitbewohner ein Mitspracherecht.",
          "Wäsche ist nicht in den Wohnräumen zu trocknen; Räume sind ausreichend zu lüften.",
          "Bei Auszug sind die Räume renoviert zu übergeben.",
          "Die Staffelmiete erhöht sich bereits am 01.07.2026, da die Konditionen des Vormieters übernommen werden."
        ].join("\n")
      }
    });

    await prisma.tenantProfile.updateMany({
      where: { unitId: tirolergasseUnit.id, id: { not: jonasProfile.id } },
      data: { isCurrent: false, moveOutDate: new Date("2025-09-30T00:00:00.000Z") }
    });

    const template = await ensureTirolergasseTemplate();
    const existingContract = await prisma.leaseContract.findFirst({
      where: { tenantProfileId: jonasProfile.id, templateId: template.id }
    });
    const generated = generateSeedContractFromTemplate(template.storagePath, jonasProfile, tirolergasseUnit, tirolergasse);
    if (!existingContract) {
      await prisma.leaseContract.create({
        data: {
          tenantProfileId: jonasProfile.id,
          unitId: tirolergasseUnit.id,
          templateId: template.id,
          docxPath: generated.docxPath,
          pdfPath: generated.pdfPath
        }
      });
    } else {
      await prisma.leaseContract.update({
        where: { id: existingContract.id },
        data: {
          unitId: tirolergasseUnit.id,
          docxPath: generated.docxPath,
          pdfPath: generated.pdfPath
        }
      });
    }
  }

  await prisma.user.updateMany({ where: { portalInstanceId: null }, data: { portalInstanceId: defaultPortal.id } });
  await prisma.property.updateMany({ where: { portalInstanceId: null }, data: { portalInstanceId: defaultPortal.id } });
  await prisma.document.updateMany({ where: { portalInstanceId: null }, data: { portalInstanceId: defaultPortal.id } });
  await prisma.contractTemplate.updateMany({ where: { portalInstanceId: null }, data: { portalInstanceId: defaultPortal.id } });
  await prisma.auditLog.updateMany({ where: { portalInstanceId: null }, data: { portalInstanceId: defaultPortal.id } });
}

async function ensureTirolergasseTemplate() {
  const contractsPath = process.env.CONTRACTS_PATH || "/app/contracts";
  fs.mkdirSync(contractsPath, { recursive: true });
  const filename = "Mietvertrag_Tirolergasse_1OG_Vorlage_mit_Platzhaltern.docx";
  const storagePath = path.join(contractsPath, filename);
  fs.writeFileSync(storagePath, createTirolergasseTemplateDocx());
  const stat = fs.statSync(storagePath);
  const existing = await prisma.contractTemplate.findFirst({ where: { name: "Mietvertrag Tirolergasse WG-Zimmer Vorlage" } });
  if (existing) {
    return prisma.contractTemplate.update({
      where: { id: existing.id },
      data: {
        filename,
        storagePath,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size: stat.size
      }
    });
  }
  return prisma.contractTemplate.create({
    data: {
      name: "Mietvertrag Tirolergasse WG-Zimmer Vorlage",
      filename,
      storagePath,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: stat.size
    }
  });
}

function generateSeedContractFromTemplate(templatePath, tenant, unit, property) {
  const contractsPath = process.env.CONTRACTS_PATH || "/app/contracts";
  const baseName = safeFilename(`Mietvertrag_${property.name}_${unit.unitNumber}_${tenant.firstName}${tenant.lastName}-Test`);
  const docxPath = path.join(contractsPath, `${baseName}.docx`);
  const pdfPath = path.join(contractsPath, `${baseName}.pdf`);
  const zip = new PizZip(fs.readFileSync(templatePath));
  const Docxtemplater = require("docxtemplater");
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, delimiters: { start: "{{", end: "}}" } });
  doc.render(seedContractData(tenant, unit, property));
  fs.writeFileSync(docxPath, doc.getZip().generate({ type: "nodebuffer" }));
  try {
    execFileSync("libreoffice", ["--headless", "--convert-to", "pdf", "--outdir", contractsPath, docxPath], { timeout: 90000 });
  } catch {
    return { docxPath, pdfPath: null };
  }
  if (!fs.existsSync(pdfPath)) return { docxPath, pdfPath: null };
  return { docxPath, pdfPath };
}

function createTirolergasseTemplateDocx() {
  const zip = new PizZip();
  zip.file("[Content_Types].xml", contentTypesXml());
  zip.folder("_rels").file(".rels", relsXml());
  zip.folder("word").file("document.xml", documentXml([
    "MIETVERTRAG fuer Wohnraum",
    "",
    "zwischen",
    "{{owner_name}}, {{owner_address}}, Tel. {{owner_phone}}, Email: {{owner_email}}",
    "als Vermieter",
    "",
    "und",
    "{{tenant_name}}, geb. am {{tenant_birthdate}}, zur Zeit wohnhaft in {{tenant_current_address}}, Mobil: {{tenant_phone}}, Email: {{tenant_email}}",
    "als Mieter.",
    "",
    "Vorspruch",
    "Der Mieter erklaert, den Mietgegenstand nur mit {{occupant_count}} Person(en) benutzen zu wollen und keine Wohngemeinschaft mit weiteren Personen zu bilden, soweit dies nicht schriftlich genehmigt wurde.",
    "",
    "§ 1 Mietgegenstand",
    "Vermietet wird in dem Hause {{property_address}} zur Nutzung als Wohnraum:",
    "{{room_description}}",
    "Mitbenutzung: {{shared_rooms}}",
    "",
    "§ 2 Miete und Betriebskosten",
    "Die Kaltmiete betraegt monatlich {{rent_amount}}.",
    "Der Anteil fuer die Tiefgarage betraegt monatlich {{garage_rent}}.",
    "Kaltmiete inklusive Tiefgarage: {{cold_rent_total}}.",
    "Auf die Betriebskosten leistet der Mieter monatlich {{service_charges}}.",
    "Monatliche Gesamtmiete: {{warm_rent}}.",
    "Die Miete ist spaetestens am {{rent_due_day}}. Werktag des jeweiligen Monats im Voraus zu zahlen.",
    "Zahlungskonto: {{landlord_bank_name}}, IBAN {{landlord_bank_account}}.",
    "",
    "§ 3 Staffelmiete",
    "{{stepped_rent}}",
    "",
    "§ 4 Mietzeit",
    "Das Mietverhaeltnis beginnt am {{lease_start_date}}. Einzug ist am {{move_in_date}}.",
    "",
    "§ 5 Sicherheitsleistung",
    "Der Mieter leistet eine Kaution in Hoehe von {{deposit}}.",
    "",
    "§ 6 Besondere Vereinbarungen",
    "{{special_agreements}}",
    "",
    "§ 7 Vertragsnotizen",
    "{{contract_notes}}",
    "",
    "Ort, Datum: ______________________________",
    "Mieter: ___________________________________",
    "Vermieter: ________________________________"
  ]));
  zip.folder("word").folder("_rels").file("document.xml.rels", documentRelsXml());
  return zip.generate({ type: "nodebuffer" });
}

function seedContractData(tenant, unit, property) {
  const rent = Number(tenant.rentAmount || unit.rentAmount || 0);
  const garageRent = Number(tenant.garageRent || unit.garageRent || 0);
  const charges = Number(tenant.serviceCharges || unit.serviceCharges || 0);
  const coldRentTotal = rent + garageRent;
  return {
    tenant_name: `${tenant.firstName} ${tenant.lastName}`,
    tenant_birthdate: tenant.birthdate ? formatDate(tenant.birthdate) : "noch zu ergaenzen",
    tenant_current_address: tenant.currentAddress || "",
    tenant_phone: tenant.phone || "",
    tenant_email: tenant.email,
    property_address: property.address,
    unit_number: unit.unitNumber,
    room_description: tenant.roomDescription || unit.unitNumber,
    shared_rooms: tenant.sharedRooms || "",
    rent_amount: money(rent),
    garage_rent: money(garageRent),
    cold_rent_total: money(coldRentTotal),
    service_charges: money(charges),
    warm_rent: money(coldRentTotal + charges),
    deposit: money(tenant.deposit),
    rent_due_day: String(tenant.rentDueDay || 1),
    landlord_bank_name: tenant.landlordBankName || "",
    landlord_bank_account: tenant.landlordBankAccount || "",
    owner_name: "Gabriel Schreiber",
    owner_address: "Zur Hohenmarkt 19, 78343 Gaienhofen",
    owner_phone: "0160-90656923",
    owner_email: "mz7@post.schreiber.info",
    owner_bank_name: tenant.landlordBankName || "",
    owner_iban: tenant.landlordBankAccount || "",
    owner_tax_id: "",
    owner_notes: "",
    lease_start_date: formatDate(tenant.leaseStartDate),
    move_in_date: formatDate(tenant.moveInDate),
    occupant_count: String(tenant.occupantCount || 1),
    stepped_rent: tenant.steppedRent || "",
    special_agreements: tenant.specialAgreements || "",
    contract_notes: tenant.contractNotes || ""
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

function documentRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;
}

function documentXml(lines) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${lines.map((line) => paragraph(line)).join("")}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`;
}

function paragraph(text) {
  const escaped = String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<w:p><w:r><w:t xml:space="preserve">${escaped}</w:t></w:r></w:p>`;
}

function formatDate(value) {
  return value ? new Intl.DateTimeFormat("de-DE").format(value) : "";
}

function money(value) {
  if (value === null || value === undefined || value === "") return "";
  return `${Number(value).toFixed(2)} EUR`;
}

function safeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "datei";
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
