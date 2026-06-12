import { Role, type MailTemplate, type User } from "@prisma/client";
import { env } from "./env";
import { prisma } from "./prisma";

export type MailTemplateKey =
  | "WELCOME_OWNER"
  | "WELCOME_BROKER"
  | "WELCOME_TENANT"
  | "BROKER_ACCESS_GRANTED"
  | "DOCUMENT_SHARED"
  | "DOCUMENT_REQUESTED"
  | "CONTRACT_GENERATED"
  | "WOHNUNGSGEBER_READY"
  | "PASSWORD_CHANGED"
  | "BACKUP_EXPORTED";

export type TemplateContext = Record<string, string | number | boolean | null | undefined>;

export const MAIL_TEMPLATE_DEFINITIONS: Array<{
  key: MailTemplateKey;
  name: string;
  description: string;
  trigger: string;
  subject: string;
  text: string;
  placeholders: string[];
}> = [
  {
    key: "WELCOME_OWNER",
    name: "Zugang fuer Eigentuemer",
    description: "Begruessung und Startdaten fuer neue Eigentuemer- oder Admin-Zugaenge.",
    trigger: "Wird automatisch versendet, wenn in der Benutzerverwaltung ein weiterer Eigentuemer/Admin angelegt wird.",
    subject: "Dein Eigentuemer-Zugang zum Immobilienportal",
    placeholders: ["name", "portal_url", "login", "password"],
    text: [
      "Hallo {{name}},",
      "",
      "fuer dich wurde ein Eigentuemer-Zugang im Immobilienportal angelegt.",
      "",
      "Portal: {{portal_url}}",
      "Login: {{login}}",
      "Startpasswort: {{password}}",
      "",
      "Bitte aendere das Passwort nach dem ersten Login in den Einstellungen."
    ].join("\n")
  },
  {
    key: "WELCOME_BROKER",
    name: "Zugang fuer Makler",
    description: "Zugangsdaten und kurzer Hinweis auf freigegebene Verkaufsunterlagen.",
    trigger: "Wird automatisch versendet, wenn ein Makler angelegt oder fuer Immobilien freigeschaltet wird.",
    subject: "Dein Makler-Zugang zum Immobilienportal",
    placeholders: ["name", "portal_url", "login", "password", "properties"],
    text: [
      "Hallo {{name}},",
      "",
      "fuer dich wurde ein Makler-Zugang im Immobilienportal angelegt.",
      "Freigegebene Immobilien: {{properties}}",
      "",
      "Portal: {{portal_url}}",
      "Login: {{login}}",
      "Startpasswort: {{password}}",
      "",
      "Im Portal findest du Objektdaten, freigegebene Dokumente und Kontaktmoeglichkeiten zum Eigentuemer."
    ].join("\n")
  },
  {
    key: "WELCOME_TENANT",
    name: "Zugang fuer Mieter",
    description: "Zugangsdaten fuer Mieter mit Hinweis auf Mietvertrag, Dokumente und Wohnungsgeberbestaetigung.",
    trigger: "Wird automatisch versendet, wenn ein Mieter angelegt wird und eine echte E-Mail-Adresse vorhanden ist.",
    subject: "Dein Mieter-Zugang zum Immobilienportal",
    placeholders: ["name", "portal_url", "login", "password", "property", "unit"],
    text: [
      "Hallo {{name}},",
      "",
      "fuer dich wurde ein Mieter-Zugang im Immobilienportal angelegt.",
      "Immobilie: {{property}}",
      "Einheit: {{unit}}",
      "",
      "Portal: {{portal_url}}",
      "Login: {{login}}",
      "Startpasswort: {{password}}",
      "",
      "Dort findest du bereitgestellte Dokumente, Mietvertraege und Formulare."
    ].join("\n")
  },
  {
    key: "BROKER_ACCESS_GRANTED",
    name: "Maklerzugriff geaendert",
    description: "Information an Makler, wenn Immobilien oder Unterlagen neu freigegeben wurden.",
    trigger: "Vorbereitet fuer Aenderungen an Maklerfreigaben. Aktuell sichtbar konfigurierbar, Versand wird bei Bedarf verdrahtet.",
    subject: "Neue Freigabe im Immobilienportal",
    placeholders: ["name", "portal_url", "properties", "owner_name"],
    text: "Hallo {{name}},\n\nim Immobilienportal wurden Freigaben fuer dich aktualisiert.\n\nImmobilien: {{properties}}\n\nPortal: {{portal_url}}\n\nBei Rueckfragen kontaktiere bitte {{owner_name}}."
  },
  {
    key: "DOCUMENT_SHARED",
    name: "Dokument freigegeben",
    description: "Benachrichtigung, wenn ein Dokument fuer Makler oder Mieter freigegeben wird.",
    trigger: "Vorbereitet fuer Dokumentrechte. Versand erfolgt, sobald Rechteaenderungen explizit Benachrichtigungen ausloesen sollen.",
    subject: "Dokument im Immobilienportal freigegeben",
    placeholders: ["name", "portal_url", "document_title", "property", "unit"],
    text: "Hallo {{name}},\n\nim Immobilienportal wurde ein Dokument fuer dich freigegeben.\n\nDokument: {{document_title}}\nImmobilie: {{property}}\nEinheit: {{unit}}\n\nPortal: {{portal_url}}"
  },
  {
    key: "DOCUMENT_REQUESTED",
    name: "Unterlage angefordert",
    description: "Nachricht an den Eigentuemer, wenn ein Makler fehlende Unterlagen anfordert.",
    trigger: "Vorbereitet fuer Makleranfragen zu fehlenden Unterlagen.",
    subject: "Unterlage angefordert: {{document_title}}",
    placeholders: ["name", "requester_name", "document_title", "property", "message", "portal_url"],
    text: "Hallo {{name}},\n\n{{requester_name}} hat eine Unterlage angefordert.\n\nImmobilie: {{property}}\nDokument: {{document_title}}\nNachricht: {{message}}\n\nPortal: {{portal_url}}"
  },
  {
    key: "CONTRACT_GENERATED",
    name: "Mietvertrag erstellt",
    description: "Information an Mieter, wenn ein neuer Mietvertrag erzeugt und bereitgestellt wurde.",
    trigger: "Vorbereitet fuer die Vertragsgenerierung. Der Vertrag erscheint bereits im Portal; Mailversand kann hierueber aktiviert werden.",
    subject: "Mietvertrag im Immobilienportal bereitgestellt",
    placeholders: ["name", "portal_url", "contract_name", "property", "unit"],
    text: "Hallo {{name}},\n\nim Immobilienportal wurde ein Mietvertrag fuer dich bereitgestellt.\n\nVertrag: {{contract_name}}\nImmobilie: {{property}}\nEinheit: {{unit}}\n\nPortal: {{portal_url}}"
  },
  {
    key: "WOHNUNGSGEBER_READY",
    name: "Wohnungsgeberbestaetigung bereitgestellt",
    description: "Information an Mieter, wenn die Wohnungsgeberbestaetigung erzeugt wurde.",
    trigger: "Vorbereitet fuer die Formularerzeugung durch den Eigentuemer.",
    subject: "Wohnungsgeberbestaetigung bereitgestellt",
    placeholders: ["name", "portal_url", "property", "unit"],
    text: "Hallo {{name}},\n\ndie Wohnungsgeberbestaetigung wurde im Immobilienportal bereitgestellt.\n\nImmobilie: {{property}}\nEinheit: {{unit}}\n\nPortal: {{portal_url}}"
  },
  {
    key: "PASSWORD_CHANGED",
    name: "Passwort geaendert",
    description: "Sicherheitsinformation nach einer Passwortaenderung.",
    trigger: "Vorbereitet fuer Passwortaenderungen in den Einstellungen und der Benutzerverwaltung.",
    subject: "Passwort im Immobilienportal geaendert",
    placeholders: ["name", "portal_url", "changed_at"],
    text: "Hallo {{name}},\n\ndein Passwort im Immobilienportal wurde am {{changed_at}} geaendert.\n\nWenn du das nicht warst, melde dich bitte sofort beim Eigentuemer.\n\nPortal: {{portal_url}}"
  },
  {
    key: "BACKUP_EXPORTED",
    name: "Backup erstellt",
    description: "Interne Information an Eigentuemer, wenn ein Export/Backup erstellt wurde.",
    trigger: "Vorbereitet fuer Backup-Exportvorgaenge.",
    subject: "Backup im Immobilienportal erstellt",
    placeholders: ["name", "portal_url", "backup_name", "created_at"],
    text: "Hallo {{name}},\n\nes wurde ein Backup im Immobilienportal erstellt.\n\nBackup: {{backup_name}}\nZeitpunkt: {{created_at}}\n\nPortal: {{portal_url}}"
  }
];

export async function ensureMailTemplates(portalInstanceId?: string | null) {
  const scopedPortalInstanceId = portalInstanceId ?? null;
  await Promise.all(MAIL_TEMPLATE_DEFINITIONS.map(async (definition) => {
    const existing = await prisma.mailTemplate.findFirst({
      where: { portalInstanceId: scopedPortalInstanceId, key: definition.key },
      select: { id: true }
    });
    if (existing) {
      await prisma.mailTemplate.update({
        where: { id: existing.id },
        data: {
          name: definition.name,
          description: definition.description,
          trigger: definition.trigger,
          placeholders: definition.placeholders
        }
      });
      return;
    }
    await prisma.mailTemplate.create({ data: { ...definition, portalInstanceId: scopedPortalInstanceId } });
  }));
}

export async function getMailTemplate(key: MailTemplateKey, portalInstanceId?: string | null) {
  await ensureMailTemplates(portalInstanceId);
  return prisma.mailTemplate.findFirst({ where: { portalInstanceId: portalInstanceId ?? null, key } });
}

export function roleWelcomeTemplateKey(roleLabel: string): MailTemplateKey {
  const normalized = roleLabel.toLowerCase();
  if (normalized.includes("makler")) return "WELCOME_BROKER";
  if (normalized.includes("mieter")) return "WELCOME_TENANT";
  return "WELCOME_OWNER";
}

export function defaultTemplateContext(context?: TemplateContext) {
  return {
    portal_url: env.appUrl,
    properties: "-",
    property: "-",
    unit: "-",
    owner_name: "Eigentuemer",
    requester_name: "-",
    document_title: "-",
    contract_name: "-",
    message: "-",
    backup_name: "-",
    created_at: new Date().toLocaleString("de-DE"),
    changed_at: new Date().toLocaleString("de-DE"),
    ...context
  };
}

export function renderMailTemplate(template: Pick<MailTemplate, "subject" | "text">, context?: TemplateContext) {
  const values = defaultTemplateContext(context);
  return {
    subject: replacePlaceholders(template.subject, values),
    text: replacePlaceholders(template.text, values)
  };
}

function replacePlaceholders(value: string, context: TemplateContext) {
  return value.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const replacement = context[key];
    if (replacement === null || replacement === undefined || replacement === "") return "-";
    return String(replacement);
  });
}

export function mailTemplatePreviewContext(template: Pick<MailTemplate, "placeholders">) {
  const examples: TemplateContext = {
    name: "Max Beispiel",
    login: "max.beispiel",
    password: "Startpasswort123!",
    portal_url: env.appUrl,
    properties: "Musterstraße 12, Musterstadt",
    property: "Musterstraße 12, Musterstadt",
    unit: "WG 1. OG",
    owner_name: "Max Eigentümer",
    requester_name: "Makler Beispiel",
    document_title: "Grundbuchauszug.pdf",
    contract_name: "Mietvertrag_Musterstraße_14_Max_Beispiel.pdf",
    message: "Bitte den aktuellen Energieausweis bereitstellen.",
    backup_name: "immobilienportal-backup.json",
    created_at: "10.06.2026, 16:30",
    changed_at: "10.06.2026, 16:30"
  };
  return Object.fromEntries(template.placeholders.map((placeholder) => [placeholder, examples[placeholder] ?? `Beispiel ${placeholder}`]));
}
