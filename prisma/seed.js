const { PrismaClient, Role, DocumentStatus } = require("@prisma/client");
const bcrypt = require("bcryptjs");

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

async function main() {
  const email = process.env.ADMIN_EMAIL || "admin@example.com";
  const password = process.env.ADMIN_PASSWORD || "bitte_aendern";
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: Role.ADMIN, active: true },
    create: {
      email,
      name: "Admin",
      passwordHash,
      role: Role.ADMIN,
      active: true
    }
  });

  for (const [group, names] of Object.entries(categories)) {
    for (const name of names) {
      await prisma.documentCategory.upsert({
        where: { name },
        update: { group },
        create: { group, name }
      });
    }
  }

  const propertyCount = await prisma.property.count();
  if (propertyCount === 0) {
    const property = await prisma.property.create({
      data: {
        name: "Musterobjekt Innenstadt",
        address: "Beispielstraße 12, 12345 Musterstadt",
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

  await prisma.user.deleteMany({
    where: {
      OR: [
        { email: "makler@example.com", name: "Demo Makler" },
        { email: "mieter@example.com", name: "Demo Mieter" }
      ]
    }
  });

  const tirolergasse = await prisma.property.findFirst({
    where: { address: { contains: "Musterstraße 12" } }
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
        serviceCharges: 140,
        warmRent: 574,
        status: "vermietet"
      }
    });

    const jonasUser = await prisma.user.upsert({
      where: { email: "max.mustermann@example.com" },
      update: {
        name: "Max Mustermann",
        role: Role.TENANT,
        active: true
      },
      create: {
        email: "max.mustermann@example.com",
        name: "Max Mustermann",
        role: Role.TENANT,
        active: true,
        passwordHash: await bcrypt.hash("BitteSofortAendern123!", 12)
      }
    });

    const jonasProfile = await prisma.tenantProfile.upsert({
      where: { userId: jonasUser.id },
      update: {
        unitId: tirolergasseUnit.id,
        firstName: "Max",
        lastName: "Mustermann",
        birthdate: null,
        currentAddress: "Mieterstraße 3, 12345 Musterstadt",
        phone: "0100-0000001",
        email: "max.mustermann@example.com",
        moveInDate: new Date("2025-10-01T00:00:00.000Z"),
        moveOutDate: null,
        isCurrent: true,
        leaseStartDate: new Date("2025-10-01T00:00:00.000Z"),
        rentAmount: 434,
        serviceCharges: 140,
        deposit: 1148,
        occupantCount: 1,
        rentDueDay: 1,
        landlordBankName: "Musterbank",
        landlordBankAccount: "DE00 0000 0000 0000 0000 00",
        roomDescription: "Zimmer im ersten Obergeschoss im Haus Musterstraße 12, 12345 Musterstadt; Wohnfläche für Berechnungszwecke 18,40 m².",
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
        firstName: "Max",
        lastName: "Mustermann",
        birthdate: null,
        currentAddress: "Mieterstraße 3, 12345 Musterstadt",
        phone: "0100-0000001",
        email: "max.mustermann@example.com",
        moveInDate: new Date("2025-10-01T00:00:00.000Z"),
        moveOutDate: null,
        isCurrent: true,
        leaseStartDate: new Date("2025-10-01T00:00:00.000Z"),
        rentAmount: 434,
        serviceCharges: 140,
        deposit: 1148,
        occupantCount: 1,
        rentDueDay: 1,
        landlordBankName: "Musterbank",
        landlordBankAccount: "DE00 0000 0000 0000 0000 00",
        roomDescription: "Zimmer im ersten Obergeschoss im Haus Musterstraße 12, 12345 Musterstadt; Wohnfläche für Berechnungszwecke 18,40 m².",
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
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
