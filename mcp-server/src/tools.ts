import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFile } from "node:fs/promises";
import { isIP } from "node:net";
import { z } from "zod";
import { PortalClient } from "./portal-client.js";
import { jsonContent, structuredJsonContent, textContent } from "./format.js";

const optionalString = z.string().trim().optional();
const optionalId = z.string().trim().min(1).optional();
const money = z.union([z.string(), z.number()]).optional().nullable();
const uploadedFileInput = z.unknown().optional().describe("Bevorzugt: Datei-Referenz des MCP-/Chat-Clients. Unterstuetzt Objekte mit path, filename/name, mimeType/type, data/base64 oder url.");
const optionalFileBase64 = z.string().trim().min(1).optional().describe("Rueckfall: Dateiinhalt als Base64 oder Data-URL.");
const documentToolOutputSchema = {
  success: z.boolean(),
  documentId: z.string(),
  filename: z.string(),
  title: z.string().nullable(),
  tenantProfileId: z.string().nullable(),
  propertyId: z.string().nullable(),
  unitId: z.string().nullable(),
  categoryId: z.string().nullable(),
  categoryName: z.string().nullable(),
  scope: z.string().nullable(),
  status: z.string().nullable(),
  previewUrl: z.string().nullable(),
  downloadUrl: z.string().nullable(),
  ocrStatus: z.string().nullable().optional(),
  ocrProcessedAt: z.string().nullable().optional(),
  ocrError: z.string().nullable().optional(),
  message: z.string(),
  document: z.unknown()
};
const classifyDocumentOutputSchema = {
  ...documentToolOutputSchema,
  relatedDocumentIds: z.array(z.string()),
  timelineEvent: z.unknown().nullable(),
  timelineWarning: z.string().nullable()
};

export function registerPortalTools(server: McpServer, portal: PortalClient) {
  server.registerTool(
    "portal_health",
    {
      title: "Portal Healthcheck",
      description: "Prueft, ob das Immobilienportal und die Integrations-API erreichbar sind.",
      inputSchema: {}
    },
    async () => jsonContent(await portal.json({ path: "/api/integrations/v1/health" }))
  );

  server.registerTool(
    "portal_me",
    {
      title: "Aktueller Portal-API-Benutzer",
      description: "Zeigt an, mit welchem Portalbenutzer und welchen Scopes der MCP-Server arbeitet.",
      inputSchema: {}
    },
    async () => jsonContent(await portal.json({ path: "/api/integrations/v1/me" }))
  );

  server.registerTool(
    "search_all",
    {
      title: "Portalweit suchen",
      description: "Sucht portalweit nach Immobilien, Einheiten, Mietern, Dokumenten, Vertraegen und Benutzern.",
      inputSchema: {
        q: z.string().trim().min(2).describe("Suchbegriff, mindestens zwei Zeichen.")
      }
    },
    async ({ q }) => jsonContent(await portal.json({ path: "/api/integrations/v1/search", query: { q } }))
  );

  server.registerTool(
    "list_agent_tools",
    {
      title: "Agenten-Funktionen anzeigen",
      description: "Listet die fachlichen Agenten-Werkzeuge auf, die das Portal intern kennt.",
      inputSchema: {}
    },
    async () => jsonContent(await portal.json({ path: "/api/integrations/v1/agent/tools" }))
  );

  server.registerTool(
    "ask_portal_agent",
    {
      title: "Portal-Agent fragen",
      description: "Gibt eine freie Nutzerfrage an den bestehenden Portal-Agenten weiter. Nuetzlich fuer mehrstufige fachliche Aufgaben.",
      inputSchema: {
        message: z.string().trim().min(1),
        conversationId: z.string().trim().optional()
      }
    },
    async ({ message, conversationId }) => jsonContent(await portal.json({
      method: "POST",
      path: "/api/integrations/v1/agent/chat",
      body: { message, conversationId }
    }))
  );

  server.registerTool(
    "get_agent_conversation",
    {
      title: "Portal-Agent Konversation laden",
      description: "Laedt eine bestehende oder die letzte Portal-Agent-Konversation inklusive optionalem Debug-Zustand.",
      inputSchema: {
        conversationId: optionalString,
        includeDebug: z.boolean().optional()
      }
    },
    async ({ conversationId, includeDebug }) => jsonContent(await portal.json({
      path: "/api/integrations/v1/agent/chat",
      query: { conversationId, includeDebug: includeDebug ? "1" : undefined }
    }))
  );

  server.registerTool(
    "reset_agent_conversation",
    {
      title: "Portal-Agent Konversation zuruecksetzen",
      description: "Loescht den Kontext einer Portal-Agent-Konversation. Schreibende/kontextveraendernde Aktion.",
      inputSchema: {
        conversationId: optionalString
      }
    },
    async ({ conversationId }) => jsonContent(await portal.json({
      method: "DELETE",
      path: "/api/integrations/v1/agent/chat",
      query: { conversationId }
    }))
  );

  server.registerTool(
    "list_properties",
    {
      title: "Immobilien listen",
      description: "Listet Immobilien mit optionalem Suchbegriff und optionalen Unterdaten.",
      inputSchema: {
        q: optionalString,
        limit: z.number().int().min(1).max(100).optional(),
        updatedSince: optionalString,
        include: z.array(z.enum(["units", "documents", "tenants", "images", "brokerValuations"])).optional()
      }
    },
    async ({ q, limit, updatedSince, include }) => jsonContent(await portal.json({
      path: "/api/integrations/v1/properties",
      query: { q, limit, updatedSince, include: include?.join(",") }
    }))
  );

  server.registerTool(
    "get_property",
    {
      title: "Immobilie abrufen",
      description: "Ruft eine Immobilie per ID ab, optional mit Einheiten, Dokumenten, Mietern und Bildern.",
      inputSchema: {
        id: z.string().trim().min(1),
        include: z.array(z.enum(["units", "documents", "tenants", "images", "brokerValuations"])).optional()
      }
    },
    async ({ id, include }) => jsonContent(await portal.json({
      path: `/api/integrations/v1/properties/${encodeURIComponent(id)}`,
      query: { include: include?.join(",") }
    }))
  );

  server.registerTool(
    "list_banking_accounts",
    {
      title: "Bankkonten aus Banking listen",
      description: "Listet die in banking.schreiber.info sichtbaren Bankkonten mit Saldo. Grundlage fuer Darlehens- und Vermoegensmapping.",
      inputSchema: {}
    },
    async () => jsonContent(await portal.json({ path: "/api/integrations/v1/net-worth/accounts" }))
  );

  server.registerTool(
    "get_net_worth_summary",
    {
      title: "Nettowert und Vermoegen abrufen",
      description: "Berechnet Immobilienwerte, valutierte Darlehen, sonstige Vermoegenswerte und Gesamt-Nettowert.",
      inputSchema: {}
    },
    async () => jsonContent(await portal.json({ path: "/api/integrations/v1/net-worth" }))
  );

  server.registerTool(
    "list_net_worth_assets",
    {
      title: "Sonstige Vermoegenswerte listen",
      description: "Listet sonstige Vermoegenswerte und Verbindlichkeiten, inklusive optional gemappter Bankkonten.",
      inputSchema: {}
    },
    async () => jsonContent(await portal.json({ path: "/api/integrations/v1/net-worth/assets" }))
  );

  server.registerTool(
    "create_net_worth_asset",
    {
      title: "Sonstigen Vermoegenswert anlegen",
      description: "Legt einen Vermoegenswert oder eine Verbindlichkeit an. Kann manuell oder per Banking-Konto gemappt sein.",
      inputSchema: netWorthAssetInputShape()
    },
    async (args) => jsonContent(await portal.json({
      method: "POST",
      path: "/api/integrations/v1/net-worth/assets",
      body: args
    }))
  );

  server.registerTool(
    "update_net_worth_asset",
    {
      title: "Sonstigen Vermoegenswert aktualisieren",
      description: "Aendert einen Vermoegenswert oder eine Verbindlichkeit.",
      inputSchema: {
        id: z.string().trim().min(1),
        data: z.object(netWorthAssetInputShape()).partial()
      }
    },
    async ({ id, data }) => jsonContent(await portal.json({
      method: "PATCH",
      path: `/api/integrations/v1/net-worth/assets/${encodeURIComponent(id)}`,
      body: data
    }))
  );

  server.registerTool(
    "delete_net_worth_asset",
    {
      title: "Sonstigen Vermoegenswert loeschen",
      description: "Loescht einen Vermoegenswert oder eine Verbindlichkeit.",
      inputSchema: { id: z.string().trim().min(1) }
    },
    async ({ id }) => jsonContent(await portal.json({
      method: "DELETE",
      path: `/api/integrations/v1/net-worth/assets/${encodeURIComponent(id)}`
    }))
  );

  server.registerTool(
    "list_property_loan_account_mappings",
    {
      title: "Darlehenskonto-Mappings listen",
      description: "Listet, welche Banking-Konten als valutierte Darlehen welchen Immobilien zugeordnet sind.",
      inputSchema: {}
    },
    async () => jsonContent(await portal.json({ path: "/api/integrations/v1/net-worth/property-loans" }))
  );

  server.registerTool(
    "map_property_loan_account",
    {
      title: "Darlehenskonto einer Immobilie zuordnen",
      description: "Ordnet einer Immobilie ein Banking-Konto als Darlehenskonto zu. Danach sync_net_worth_from_banking ausfuehren.",
      inputSchema: {
        propertyId: z.string().trim().min(1),
        bankingAccountId: z.number().int(),
        label: optionalString
      }
    },
    async (args) => jsonContent(await portal.json({
      method: "POST",
      path: "/api/integrations/v1/net-worth/property-loans",
      body: args
    }))
  );

  server.registerTool(
    "unmap_property_loan_account",
    {
      title: "Darlehenskonto-Zuordnung entfernen",
      description: "Entfernt eine Darlehenskonto-Zuordnung anhand der Mapping-ID.",
      inputSchema: { id: z.string().trim().min(1) }
    },
    async ({ id }) => jsonContent(await portal.json({
      method: "DELETE",
      path: `/api/integrations/v1/net-worth/property-loans/${encodeURIComponent(id)}`
    }))
  );

  server.registerTool(
    "sync_net_worth_from_banking",
    {
      title: "Vermoegenswerte aus Banking synchronisieren",
      description: "Liest Banking-Salden ein, aktualisiert gemappte Immobilien-Darlehen und gemappte sonstige Vermoegenswerte.",
      inputSchema: {}
    },
    async () => jsonContent(await portal.json({
      method: "POST",
      path: "/api/integrations/v1/net-worth/sync",
      body: {}
    }))
  );

  server.registerTool(
    "create_property",
    {
      title: "Immobilie anlegen",
      description: "Legt eine Immobilie an. Nur mit Token-Scope write:properties moeglich.",
      inputSchema: propertyInputShape()
    },
    async (args) => jsonContent(await portal.json({
      method: "POST",
      path: "/api/integrations/v1/properties",
      body: args
    }))
  );

  server.registerTool(
    "update_property",
    {
      title: "Immobilie aktualisieren",
      description: "Aktualisiert Stammdaten, Adresse, Kaufpreis, Darlehen oder Status einer Immobilie.",
      inputSchema: {
        id: z.string().trim().min(1),
        data: z.object(propertyInputShape()).partial()
      }
    },
    async ({ id, data }) => jsonContent(await portal.json({
      method: "PATCH",
      path: `/api/integrations/v1/properties/${encodeURIComponent(id)}`,
      body: data
    }))
  );

  server.registerTool(
    "list_units",
    {
      title: "Einheiten listen",
      description: "Listet Einheiten, optional gefiltert nach Immobilie.",
      inputSchema: {
        propertyId: optionalId
      }
    },
    async ({ propertyId }) => jsonContent(await portal.json({
      path: "/api/integrations/v1/units",
      query: { propertyId }
    }))
  );

  server.registerTool(
    "create_unit",
    {
      title: "Einheit anlegen",
      description: "Legt eine Einheit zu einer Immobilie an.",
      inputSchema: unitInputShape()
    },
    async (args) => jsonContent(await portal.json({
      method: "POST",
      path: "/api/integrations/v1/units",
      body: args
    }))
  );

  server.registerTool(
    "update_unit",
    {
      title: "Einheit aktualisieren",
      description: "Aktualisiert Einheitendaten. Warmmiete wird im Portal aus Kaltmiete, Tiefgarage und Nebenkosten berechnet.",
      inputSchema: {
        id: z.string().trim().min(1),
        data: z.object(unitInputShape()).omit({ propertyId: true }).partial()
      }
    },
    async ({ id, data }) => jsonContent(await portal.json({
      method: "PATCH",
      path: `/api/integrations/v1/units/${encodeURIComponent(id)}`,
      body: data
    }))
  );

  server.registerTool(
    "delete_unit",
    {
      title: "Einheit loeschen",
      description: "Loescht eine Einheit. Vorsicht: schreibende Aktion.",
      inputSchema: {
        id: z.string().trim().min(1)
      }
    },
    async ({ id }) => jsonContent(await portal.json({
      method: "DELETE",
      path: `/api/integrations/v1/units/${encodeURIComponent(id)}`
    }))
  );

  server.registerTool(
    "list_tenants",
    {
      title: "Mieter listen",
      description: "Listet Mieter, optional gefiltert nach Immobilie und aktueller Belegung.",
      inputSchema: {
        propertyId: optionalId,
        current: z.boolean().optional()
      }
    },
    async ({ propertyId, current }) => jsonContent(await portal.json({
      path: "/api/integrations/v1/tenants",
      query: { propertyId, current: current === undefined ? undefined : String(current) }
    }))
  );

  server.registerTool(
    "get_tenant",
    {
      title: "Mieter abrufen",
      description: "Ruft einen Mieter inklusive Einheit/Immobilie per TenantProfile-ID ab.",
      inputSchema: {
        id: z.string().trim().min(1)
      }
    },
    async ({ id }) => jsonContent(await portal.json({
      path: `/api/integrations/v1/tenants/${encodeURIComponent(id)}`
    }))
  );

  server.registerTool(
    "create_tenant",
    {
      title: "Mieter anlegen",
      description: "Legt einen Mieter mit minimalen oder vollstaendigen Angaben an.",
      inputSchema: tenantInputShape()
    },
    async (args) => jsonContent(await portal.json({
      method: "POST",
      path: "/api/integrations/v1/tenants",
      body: args
    }))
  );

  server.registerTool(
    "update_tenant",
    {
      title: "Mieter aktualisieren",
      description: "Aktualisiert Mieter-, Miet- und Kautionsdaten.",
      inputSchema: {
        id: z.string().trim().min(1),
        data: z.object(tenantInputShape()).partial()
      }
    },
    async ({ id, data }) => jsonContent(await portal.json({
      method: "PATCH",
      path: `/api/integrations/v1/tenants/${encodeURIComponent(id)}`,
      body: data
    }))
  );

  server.registerTool(
    "list_tenant_documents",
    {
      title: "Mieterdokumente listen",
      description: "Listet Dokumente, die einem bestimmten Mieter zugeordnet sind.",
      inputSchema: {
        tenantId: z.string().trim().min(1)
      }
    },
    async ({ tenantId }) => jsonContent(await portal.json({
      path: `/api/integrations/v1/tenants/${encodeURIComponent(tenantId)}/documents`
    }))
  );

  server.registerTool(
    "create_landlord_confirmation",
    {
      title: "Wohnungsgeberbestaetigung erzeugen",
      description: "Erzeugt fuer einen Mieter eine Wohnungsgeberbestaetigung, falls noch keine aktive vorhanden ist.",
      inputSchema: {
        tenantId: z.string().trim().min(1)
      }
    },
    async ({ tenantId }) => jsonContent(await portal.json({
      method: "POST",
      path: `/api/integrations/v1/tenants/${encodeURIComponent(tenantId)}/wohnungsgeberbestaetigung`
    }))
  );

  server.registerTool(
    "list_documents",
    {
      title: "Dokumente listen",
      description: "Listet Dokumente mit Filtern nach Immobilie, Einheit, Kategorie, Jahr oder Suchbegriff.",
      inputSchema: {
        q: optionalString,
        propertyId: optionalId,
        unitId: optionalId,
        categoryId: optionalId,
        tenantProfileId: optionalId,
        documentYear: z.number().int().min(1900).max(2049).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        updatedSince: optionalString
      }
    },
    async (args) => jsonContent(await portal.json({
      path: "/api/integrations/v1/documents",
      query: args
    }))
  );

  server.registerTool(
    "list_document_categories",
    {
      title: "Dokumentkategorien listen",
      description: "Listet alle Dokumentkategorien der aktuellen Portalinstanz. Nutze dies vor Uploads, wenn der Nutzer eine Kategorie wie Kuendigungen, Mietvertrag, Grundbuchauszug oder Fotos nennt.",
      inputSchema: {}
    },
    async () => jsonContent(await portal.json({ path: "/api/integrations/v1/document-categories" }))
  );

  server.registerTool(
    "upload_document",
    {
      title: "Dokument hochladen",
      description: "Laedt eine vom Nutzer bereitgestellte oder im Chat angehaengte Datei in das Portal hoch. Verwende bevorzugt den Datei-Anhang im Feld file; fileBase64 bleibt als Rueckfall erhalten. Ordne Mieterdokumente mit tenantProfileId zu; fuer reine Mieterdokumente ist upload_tenant_document bequemer.",
      inputSchema: {
        file: uploadedFileInput,
        fileBase64: optionalFileBase64,
        filename: z.string().trim().min(1).optional().describe("Dateiname inklusive Erweiterung, z. B. Mietvertrag.pdf."),
        mimeType: z.string().trim().min(1).optional().describe("MIME-Type, z. B. application/pdf."),
        title: optionalString.describe("Anzeigetitel im Portal. Wenn leer, wird filename verwendet."),
        propertyId: optionalId.describe("Optionale Immobilien-ID."),
        unitId: optionalId.describe("Optionale Einheiten-ID."),
        tenantProfileId: optionalId.describe("Optionale TenantProfile-ID."),
        categoryId: optionalId.describe("Optionale Dokumentkategorie-ID."),
        status: z.enum(["MISSING", "REQUESTED", "AVAILABLE", "SHARED", "NOT_RELEVANT"]).optional(),
        scope: z.enum(["PROPERTY", "UNIT", "TENANT", "CONTRACT"]).optional(),
        summary: optionalString.describe("Optionale Kurzbeschreibung."),
        tags: z.array(z.string()).optional(),
        documentYear: z.number().int().min(1900).max(2049).optional(),
        runOcr: z.boolean().optional().describe("Wenn true, fuehrt das Portal nach dem Upload OCR fuer PDF-/Bilddateien aus."),
        isPropertyImage: z.boolean().optional(),
        isPrimaryImage: z.boolean().optional()
      },
      outputSchema: documentToolOutputSchema
    },
    async (args) => {
      const file = await resolveUploadPayload(args.file, args.fileBase64, args.filename, args.mimeType);
      const document = await portal.json<IntegrationDocumentLike>({
        method: "POST",
        path: "/api/integrations/v1/documents",
        body: {
          ...args,
          file: undefined,
          fileBase64: file.fileBase64,
          filename: file.filename,
          mimeType: file.mimeType
        }
      });
      return structuredJsonContent(documentToolResult(document, {
        message: "Dokument wurde hochgeladen."
      }));
    }
  );

  server.registerTool(
    "upload_inbox_document",
    {
      title: "Dokument in Eingang hochladen",
      description: "Laedt eine vom Nutzer bereitgestellte oder im Chat/E-Mail-Kontext angehaengte Datei zuerst neutral in den Dokumenteneingang hoch. Nutze dieses Tool immer, wenn eine Datei erst gesichert werden soll und die fachliche Einsortierung danach erfolgen kann. Danach kann classify_document die Immobilie, Einheit, Mieter, Kategorie und Verknuepfung setzen.",
      inputSchema: {
        file: uploadedFileInput,
        fileBase64: optionalFileBase64,
        filename: z.string().trim().min(1).optional().describe("Dateiname inklusive Erweiterung."),
        mimeType: z.string().trim().min(1).optional().describe("MIME-Type, z. B. application/pdf."),
        title: optionalString.describe("Anzeigetitel im Portal."),
        summary: optionalString.describe("Kurze vorlaeufige Beschreibung."),
        tags: z.array(z.string()).optional(),
        documentYear: z.number().int().min(1900).max(2049).optional(),
        runOcr: z.boolean().optional().describe("Wenn true, fuehrt das Portal nach dem Upload OCR fuer PDF-/Bilddateien aus.")
      },
      outputSchema: documentToolOutputSchema
    },
    async ({ file, fileBase64, filename, mimeType, title, summary, tags, documentYear, runOcr }) => {
      const upload = await resolveUploadPayload(file, fileBase64, filename, mimeType);
      const document = await portal.json({
        method: "POST",
        path: "/api/integrations/v1/documents",
        body: {
          fileBase64: upload.fileBase64,
          filename: upload.filename,
          mimeType: upload.mimeType,
          title: title || upload.filename,
          status: "AVAILABLE",
          scope: "PROPERTY",
          summary: summary || "Ueber MCP hochgeladen; fachliche Einsortierung steht noch aus.",
          tags: ["eingang", "mcp-upload", ...(tags || [])],
          documentYear,
          runOcr
        }
      });
      return structuredJsonContent(documentToolResult(document as IntegrationDocumentLike, {
        message: "Dokument wurde neutral in den Eingang hochgeladen. Nutze als naechsten Schritt classify_document zur Einsortierung."
      }));
    }
  );

  server.registerTool(
    "classify_document",
    {
      title: "Dokument einsortieren",
      description: "Sortiert ein bereits hochgeladenes Dokument fachlich ein. Standardablauf fuer LLMs: 1. upload_inbox_document, 2. classify_document. Setzt Immobilie, Einheit, Mieter, Kategorie per categoryName, Beschreibung, Tags und Jahr. Optional wird ein Timeline-Ereignis erzeugt, um z. B. ein Anschreiben mit einer Abrechnung zu verknuepfen.",
      inputSchema: {
        documentId: z.string().trim().min(1).describe("ID des bereits hochgeladenen Dokuments."),
        propertyId: optionalId.describe("Optionale Immobilien-ID. Bei Objektunterlagen setzen."),
        unitId: optionalId.describe("Optionale Einheiten-ID."),
        tenantProfileId: optionalId.describe("Optionale TenantProfile-ID, wenn das Dokument persoenlich zum Mieter gehoert."),
        categoryName: optionalString.describe("Kategorie-Name, z. B. Anschreiben, Nebenkostenabrechnungen, Hausgeldabrechnungen, Rechnungen, Kuendigung."),
        categoryGroup: optionalString.describe("Kategorie-Gruppe fuer neu anzulegende Kategorien. Default: Allgemein."),
        createCategoryIfMissing: z.boolean().optional().describe("Default true. Legt die Kategorie an, falls sie fehlt und der Token write:settings hat."),
        title: optionalString.describe("Neuer Dokumenttitel."),
        filename: optionalString.describe("Optionaler neuer Dateiname."),
        status: z.enum(["MISSING", "REQUESTED", "AVAILABLE", "SHARED", "NOT_RELEVANT"]).optional(),
        scope: z.enum(["PROPERTY", "UNIT", "TENANT", "CONTRACT"]).optional(),
        summary: optionalString.describe("Inhaltliche Kurzbeschreibung."),
        tags: z.array(z.string()).optional(),
        documentYear: z.number().int().min(1900).max(2049).nullable().optional(),
        relatedDocumentIds: z.array(z.string().trim().min(1)).optional().describe("Weitere Dokumente, die fachlich damit zusammenhaengen."),
        relationNote: optionalString.describe("Kurzer Hinweis zur Beziehung, z. B. 'Anschreiben gehoert zur Abrechnung'."),
        createTimelineEvent: z.boolean().optional().describe("Default true, wenn relatedDocumentIds oder relationNote gesetzt sind.")
      },
      outputSchema: classifyDocumentOutputSchema
    },
    async ({ documentId, propertyId, unitId, tenantProfileId, categoryName, categoryGroup, createCategoryIfMissing, title, filename, status, scope, summary, tags, documentYear, relatedDocumentIds, relationNote, createTimelineEvent }) => {
      const categoryId = categoryName
        ? await resolveDocumentCategoryId(portal, categoryName, categoryGroup || "Allgemein", createCategoryIfMissing !== false)
        : undefined;
      const relationTags = relatedDocumentIds?.length ? [`verbunden:${relatedDocumentIds.join(",")}`] : [];
      const nextTags = tags?.length || relationTags.length ? [...(tags || []), ...relationTags] : undefined;
      const relationSummary = relationNote
        ? `${summary || ""}${summary ? "\n\n" : ""}Verknuepfung: ${relationNote}${relatedDocumentIds?.length ? ` (${relatedDocumentIds.join(", ")})` : ""}`
        : summary;
      const document = await portal.json<{ id: string; propertyId?: string | null; unitId?: string | null; tenantProfileId?: string | null; title?: string | null }>({
        method: "PATCH",
        path: `/api/integrations/v1/documents/${encodeURIComponent(documentId)}`,
        body: {
          title,
          filename,
          propertyId,
          unitId,
          tenantProfileId,
          categoryId,
          status,
          scope: scope || (tenantProfileId ? "TENANT" : unitId ? "UNIT" : propertyId ? "PROPERTY" : undefined),
          summary: relationSummary,
          tags: nextTags,
          documentYear
        }
      });

      let timelineEvent: unknown = null;
      let timelineWarning: string | null = null;
      const shouldCreateTimelineEvent = createTimelineEvent ?? Boolean(relatedDocumentIds?.length || relationNote);
      if (shouldCreateTimelineEvent && (relatedDocumentIds?.length || relationNote) && (document.propertyId || propertyId)) {
        try {
          timelineEvent = await portal.json({
            method: "POST",
            path: "/api/integrations/v1/timeline",
            body: {
              propertyId: document.propertyId || propertyId,
              unitId: document.unitId || unitId || null,
              tenantProfileId: document.tenantProfileId || tenantProfileId || null,
              eventType: "NOTE",
              title: relationNote || `Dokument verknuepft: ${document.title || title || documentId}`,
              description: relationSummary || "Dokument wurde einsortiert und fachlich verknuepft.",
              status: "INFO",
              eventDate: new Date().toISOString(),
              documentIds: [document.id, ...(relatedDocumentIds || [])]
            }
          });
        } catch (error) {
          timelineWarning = error instanceof Error ? error.message : "Timeline-Verknuepfung konnte nicht angelegt werden.";
        }
      }

      return structuredJsonContent({
        ...documentToolResult(document as IntegrationDocumentLike, {
          categoryName: categoryName || null,
          categoryId: categoryId || null,
          message: categoryName
            ? `Dokument wurde einsortiert und der Kategorie '${categoryName}' zugeordnet.`
            : "Dokument wurde einsortiert."
        }),
        categoryName: categoryName || null,
        categoryId: categoryId || null,
        relatedDocumentIds: relatedDocumentIds || [],
        timelineEvent,
        timelineWarning
      });
    }
  );

  server.registerTool(
    "upload_tenant_document",
    {
      title: "Mieterdokument hochladen",
      description: "Laedt eine vom Nutzer im aktuellen Chat angehaengte Datei gezielt bei einem Mieter ab. Verwende bevorzugt file fuer Chat-Anhaenge; fileBase64 ist nur Rueckfall. Geeignet fuer Kuendigungen, Mietvertraege, Wohnungsgeberbestaetigungen, Kautionsnachweise oder andere persoenliche Mieterdokumente. Die Kategorie kann per categoryName wie 'Kuendigungen' angegeben werden; der MCP sucht die passende Kategorie-ID und legt die Kategorie bei Bedarf mit write:settings an. Automatische Dateinamenszusaetze wie (1), (2) oder Kopie werden bereinigt.",
      inputSchema: {
        tenantProfileId: z.string().trim().min(1).describe("TenantProfile-ID des Mieters, z. B. nach list_tenants/get_tenant."),
        file: uploadedFileInput,
        fileBase64: optionalFileBase64,
        filename: z.string().trim().min(1).optional().describe("Sinnvoller Dateiname inklusive Erweiterung, z. B. 2026-06-26_Kuendigung_Mieter.pdf."),
        mimeType: z.string().trim().min(1).optional().describe("MIME-Type, z. B. application/pdf."),
        title: optionalString.describe("Anzeigetitel im Portal."),
        categoryName: optionalString.describe("Kategorie-Name, z. B. Kuendigungen. Wenn keine Kategorie passt, wird sie optional erstellt."),
        categoryGroup: optionalString.describe("Kategorie-Gruppe fuer neu anzulegende Kategorien. Default: Vermietung."),
        createCategoryIfMissing: z.boolean().optional().describe("Default true. Legt die Kategorie an, falls sie fehlt und der Token write:settings hat."),
        status: z.enum(["MISSING", "REQUESTED", "AVAILABLE", "SHARED", "NOT_RELEVANT"]).optional(),
        summary: optionalString.describe("Kurze Inhaltsbeschreibung."),
        tags: z.array(z.string()).optional(),
        documentYear: z.number().int().min(1900).max(2049).optional(),
        runOcr: z.boolean().optional().describe("Wenn true, fuehrt das Portal nach dem Upload OCR fuer PDF-/Bilddateien aus.")
      },
      outputSchema: documentToolOutputSchema
    },
    async ({ tenantProfileId, file, fileBase64, filename, mimeType, title, categoryName, categoryGroup, createCategoryIfMissing, status, summary, tags, documentYear, runOcr }) => {
      const upload = await resolveUploadPayload(file, fileBase64, filename, mimeType);
      const tenant = await portal.json<{ id: string; unitId?: string | null; unit?: { id: string; propertyId?: string | null } | null }>({
        path: `/api/integrations/v1/tenants/${encodeURIComponent(tenantProfileId)}`
      });
      const categoryId = categoryName
        ? await resolveDocumentCategoryId(portal, categoryName, categoryGroup || "Vermietung", createCategoryIfMissing !== false)
        : null;
      const document = await portal.json<IntegrationDocumentLike>({
        method: "POST",
        path: "/api/integrations/v1/documents",
        body: {
          fileBase64: upload.fileBase64,
          filename: upload.filename,
          mimeType: upload.mimeType,
          title: title || upload.filename,
          tenantProfileId,
          unitId: tenant.unitId || tenant.unit?.id || null,
          propertyId: tenant.unit?.propertyId || null,
          categoryId,
          status: status || "AVAILABLE",
          scope: "TENANT",
          summary,
          tags,
          documentYear,
          runOcr
        }
      });
      return structuredJsonContent(documentToolResult(document, {
        categoryName: categoryName || null,
        categoryId,
        message: categoryName
          ? `Dokument wurde beim Mieter abgelegt und der Kategorie '${categoryName}' zugeordnet.`
          : "Dokument wurde beim Mieter abgelegt."
      }));
    }
  );

  server.registerTool(
    "update_document",
    {
      title: "Dokument aktualisieren",
      description: "Aktualisiert Dokumentmetadaten, Kategorie, Zuordnung, Beschreibung, Tags oder Bildstatus.",
      inputSchema: {
        id: z.string().trim().min(1),
        data: z.object(documentUpdateShape())
      }
    },
    async ({ id, data }) => jsonContent(await portal.json({
      method: "PATCH",
      path: `/api/integrations/v1/documents/${encodeURIComponent(id)}`,
      body: data
    }))
  );

  server.registerTool(
    "delete_document",
    {
      title: "Dokument loeschen",
      description: "Loescht ein Dokument inklusive privater Datei. Vorsicht: schreibende Aktion.",
      inputSchema: {
        id: z.string().trim().min(1)
      }
    },
    async ({ id }) => jsonContent(await portal.json({
      method: "DELETE",
      path: `/api/integrations/v1/documents/${encodeURIComponent(id)}`
    }))
  );

  server.registerTool(
    "get_document_links",
    {
      title: "Dokument-Links erzeugen",
      description: "Erzeugt zeitlich signierte Portal-Links fuer Vorschau, Thumbnail und Download eines Dokuments.",
      inputSchema: {
        id: z.string().trim().min(1)
      }
    },
    async ({ id }) => {
      const result = await portal.json<{ links: { preview: string; thumbnail: string; download: string | null }; expiresAt: string }>({
        path: `/api/integrations/v1/documents/${encodeURIComponent(id)}/links`
      });
      return textContent([
        "Signierte Dokumentlinks:",
        `Vorschau: ${result.links.preview}`,
        `Thumbnail: ${result.links.thumbnail}`,
        result.links.download ? `Download: ${result.links.download}` : "Download: nicht erlaubt",
        `Gueltig bis: ${result.expiresAt}`
      ].join("\n"));
    }
  );

  server.registerTool(
    "read_document_content",
    {
      title: "Dokumentinhalt lesen",
      description: "Liest maschinenlesbaren Text aus einem Dokument. Bei Scan-PDFs oder nicht extrahierbaren Dateien kann die Originaldatei als Base64 fuer eine clientseitige Bild-/Dateierkennung mitgeliefert werden. Braucht read:documents und download:documents.",
      inputSchema: {
        id: z.string().trim().min(1),
        includeFile: z.boolean().optional().describe("Wenn true, wird die Datei als Base64 mitgeliefert, sofern sie nicht zu gross ist."),
        preferPdf: z.boolean().optional().describe("Wenn true, werden Office-Dateien nach Moeglichkeit als PDF zurueckgegeben."),
        maxChars: z.number().int().min(1000).max(500000).optional().describe("Maximale Zeichenanzahl fuer extrahierten Text.")
      }
    },
    async ({ id, includeFile, preferPdf, maxChars }) => jsonContent(await portal.json({
      path: `/api/integrations/v1/documents/${encodeURIComponent(id)}/content`,
      query: { includeFile, preferPdf, maxChars }
    }))
  );

  server.registerTool(
    "get_document_ocr",
    {
      title: "Dokument-OCR lesen",
      description: "Liest OCR-Status und erkannten Text eines Dokuments. Nutze dies, wenn ein Dokument inhaltlich ausgewertet werden soll.",
      inputSchema: {
        id: z.string().trim().min(1)
      }
    },
    async ({ id }) => jsonContent(await portal.json({
      path: `/api/integrations/v1/documents/${encodeURIComponent(id)}/ocr`
    }))
  );

  server.registerTool(
    "run_document_ocr",
    {
      title: "Dokument-OCR ausführen",
      description: "Fuehrt OCR fuer ein bestehendes PDF-/Bilddokument aus und speichert den Text im Portal. Braucht write:documents.",
      inputSchema: {
        id: z.string().trim().min(1)
      }
    },
    async ({ id }) => jsonContent(await portal.json({
      method: "POST",
      path: `/api/integrations/v1/documents/${encodeURIComponent(id)}/ocr`
    }))
  );

  server.registerTool(
    "list_contract_templates",
    {
      title: "Vertragsvorlagen listen",
      description: "Listet Vertragsvorlagen, optional immobilienbezogen.",
      inputSchema: {
        propertyId: optionalId
      }
    },
    async ({ propertyId }) => jsonContent(await portal.json({
      path: "/api/integrations/v1/templates",
      query: { propertyId }
    }))
  );

  server.registerTool(
    "derive_contract_template",
    {
      title: "Vertragsvorlage ableiten",
      description: "Erzeugt aus einem vorhandenen Dokument eine bearbeitbare Vertragsvorlage, wenn der Portal-Endpunkt dies erlaubt.",
      inputSchema: {
        documentId: z.string().trim().min(1),
        name: z.string().trim().min(1),
        propertyId: optionalId,
        isGlobalTemplate: z.boolean().optional()
      }
    },
    async (args) => jsonContent(await portal.json({
      method: "POST",
      path: "/api/integrations/v1/templates/derive",
      body: args
    }))
  );

  server.registerTool(
    "create_contract",
    {
      title: "Mietvertrag erzeugen",
      description: "Erzeugt einen Mietvertrag fuer Mieter und Einheit. Gibt Vertrags-ID sowie Preview-/Download-Links zurueck.",
      inputSchema: {
        tenantProfileId: z.string().trim().min(1),
        unitId: z.string().trim().min(1),
        templateId: z.string().trim().optional().nullable()
      }
    },
    async (args) => jsonContent(await portal.json({
      method: "POST",
      path: "/api/integrations/v1/contracts",
      body: args
    }))
  );

  server.registerTool(
    "create_contract_from_query",
    {
      title: "Mietvertrag per Suchtext erzeugen",
      description: "Sucht den passenden aktuellen Mieter anhand eines Suchtexts und erzeugt einen Vertrag oder liefert Debug-Treffer.",
      inputSchema: {
        query: z.string().trim().min(1),
        dryRun: z.boolean().optional()
      }
    },
    async (args) => jsonContent(await portal.json({
      method: "POST",
      path: "/api/integrations/v1/contracts/from-query",
      body: args
    }))
  );

  server.registerTool(
    "list_contracts",
    {
      title: "Mietvertraege listen",
      description: "Listet Mietvertraege, optional fuer einen Mieter.",
      inputSchema: {
        tenantId: optionalId
      }
    },
    async ({ tenantId }) => jsonContent(await portal.json({
      path: "/api/integrations/v1/contracts",
      query: { tenantId }
    }))
  );

  server.registerTool(
    "delete_contract",
    {
      title: "Mietvertrag loeschen",
      description: "Loescht einen Mietvertrag. Vorsicht: schreibende Aktion.",
      inputSchema: {
        id: z.string().trim().min(1)
      }
    },
    async ({ id }) => jsonContent(await portal.json({
      method: "DELETE",
      path: `/api/integrations/v1/contracts/${encodeURIComponent(id)}`
    }))
  );

  server.registerTool(
    "get_contract_links",
    {
      title: "Mietvertrags-Links erzeugen",
      description: "Erzeugt stabile signierte Portal-Links fuer Vorschau, DOCX und PDF. Diese Links koennen ohne Portal-Login geoeffnet werden, bis sie ablaufen.",
      inputSchema: {
        id: z.string().trim().min(1)
      }
    },
    async ({ id }) => jsonContent(await portal.json({
      path: `/api/integrations/v1/contracts/${encodeURIComponent(id)}`
    }))
  );

  server.registerTool(
    "list_rent_payments",
    {
      title: "Mieteinnahmen listen",
      description: "Listet Soll-/Ist-Mieten fuer einen Monat.",
      inputSchema: {
        year: z.number().int().min(2000).max(2100).optional(),
        month: z.number().int().min(1).max(12).optional()
      }
    },
    async (args) => jsonContent(await portal.json({
      path: "/api/integrations/v1/rent-payments",
      query: args
    }))
  );

  server.registerTool(
    "upsert_rent_payment",
    {
      title: "Mietzahlung erfassen oder korrigieren",
      description: "Setzt, korrigiert oder setzt eine Mietzahlung fuer Einheit/Monat zurueck.",
      inputSchema: {
        unitId: z.string().trim().min(1),
        tenantProfileId: z.string().trim().optional().nullable(),
        year: z.number().int().min(2000).max(2100),
        month: z.number().int().min(1).max(12),
        expectedColdRent: z.number().min(0),
        expectedServiceCharges: z.number().min(0),
        expectedTotalRent: z.number().min(0),
        paidColdRent: z.number().min(0).optional().nullable(),
        paidServiceCharges: z.number().min(0).optional().nullable(),
        paidTotalRent: z.number().min(0).optional().nullable(),
        status: z.enum(["OPEN", "PAID", "PARTIAL"]),
        paidAt: z.string().optional().nullable()
      }
    },
    async (args) => jsonContent(await portal.json({
      method: "POST",
      path: "/api/integrations/v1/rent-payments",
      body: args
    }))
  );

  server.registerTool(
    "list_timeline_events",
    {
      title: "Timeline-Ereignisse listen",
      description: "Listet chronologische Ereignisse zu Immobilien, Einheiten oder Mietern inklusive automatisch abgeleiteter Miet-, Kautions- und Vertragsereignisse.",
      inputSchema: {
        propertyId: optionalId,
        unitId: optionalId,
        tenantProfileId: optionalId,
        includeDerived: z.boolean().optional(),
        includeInternal: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).optional()
      }
    },
    async ({ propertyId, unitId, tenantProfileId, includeDerived, includeInternal, limit }) => jsonContent(await portal.json({
      path: "/api/integrations/v1/timeline",
      query: {
        propertyId,
        unitId,
        tenantProfileId,
        derived: includeDerived === false ? "0" : undefined,
        internal: includeInternal ? "1" : undefined,
        limit
      }
    }))
  );

  server.registerTool(
    "create_timeline_event",
    {
      title: "Timeline-Ereignis anlegen",
      description: "Legt ein fachliches Timeline-Ereignis mit optionaler Dokumentverknuepfung, Mieter-/Einheitenbezug und Kosten an.",
      inputSchema: timelineEventInputShape()
    },
    async (args) => jsonContent(await portal.json({
      method: "POST",
      path: "/api/integrations/v1/timeline",
      body: args
    }))
  );

  server.registerTool(
    "update_timeline_event",
    {
      title: "Timeline-Ereignis aktualisieren",
      description: "Aktualisiert ein manuell angelegtes Timeline-Ereignis.",
      inputSchema: {
        id: z.string().trim().min(1),
        data: z.object(timelineEventInputShape()).partial()
      }
    },
    async ({ id, data }) => jsonContent(await portal.json({
      method: "PATCH",
      path: `/api/integrations/v1/timeline/${encodeURIComponent(id)}`,
      body: data
    }))
  );

  server.registerTool(
    "delete_timeline_event",
    {
      title: "Timeline-Ereignis loeschen",
      description: "Loescht ein manuell angelegtes Timeline-Ereignis. Vorsicht: schreibende Aktion.",
      inputSchema: {
        id: z.string().trim().min(1)
      }
    },
    async ({ id }) => jsonContent(await portal.json({
      method: "DELETE",
      path: `/api/integrations/v1/timeline/${encodeURIComponent(id)}`
    }))
  );

  server.registerTool(
    "list_todos",
    {
      title: "Offene To-dos listen",
      description: "Listet globale offene oder erledigte To-dos ueber Immobilien hinweg.",
      inputSchema: {
        includeCompleted: z.boolean().optional()
      }
    },
    async ({ includeCompleted }) => jsonContent(await portal.json({
      path: "/api/integrations/v1/todos",
      query: { includeCompleted }
    }))
  );

  server.registerTool(
    "list_audit_logs",
    {
      title: "Aktivitaeten lesen",
      description: "Listet Audit-Logs/Aktivitaeten.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional()
      }
    },
    async ({ limit }) => jsonContent(await portal.json({
      path: "/api/integrations/v1/audit-logs",
      query: { limit }
    }))
  );

  server.registerTool(
    "list_users",
    {
      title: "Benutzer listen",
      description: "Listet Benutzer, Rollen und Zuordnungen der aktuellen Portalinstanz.",
      inputSchema: {}
    },
    async () => jsonContent(await portal.json({ path: "/api/integrations/v1/users" }))
  );

  server.registerTool(
    "update_user",
    {
      title: "Benutzer aktualisieren",
      description: "Aktualisiert Benutzerdaten, Rolle, Aktivstatus oder Passwort.",
      inputSchema: {
        id: z.string().trim().min(1),
        data: z.object({
          name: optionalString,
          username: optionalString,
          email: optionalString,
          role: z.enum(["ADMIN", "BROKER", "TENANT", "TAX_ADVISOR"]).optional(),
          active: z.boolean().optional(),
          password: optionalString,
          contactPerson: optionalString,
          contactAddress: optionalString,
          contactPhone: optionalString,
          contactEmail: optionalString
        })
      }
    },
    async ({ id, data }) => jsonContent(await portal.json({
      method: "PATCH",
      path: `/api/integrations/v1/users/${encodeURIComponent(id)}`,
      body: data
    }))
  );

  server.registerTool(
    "list_portal_instances",
    {
      title: "Portalinstanzen listen",
      description: "Listet Portalinstanzen, sofern der Token die noetigen Rechte hat.",
      inputSchema: {}
    },
    async () => jsonContent(await portal.json({ path: "/api/integrations/v1/portal-instances" }))
  );

  server.registerTool(
    "switch_portal_instance",
    {
      title: "Portalinstanz wechseln",
      description: "Wechselt die Sicht/Instanz fuer den Integrationstoken, wenn erlaubt.",
      inputSchema: {
        portalInstanceId: z.string().trim().min(1)
      }
    },
    async (args) => jsonContent(await portal.json({
      method: "POST",
      path: "/api/integrations/v1/portal-instances/switch",
      body: args
    }))
  );

  server.registerTool(
    "integration_api_request",
    {
      title: "Kontrollierter Integrations-API-Aufruf",
      description: "Fallback fuer neue /api/integrations/v1-Endpunkte. Nur relative Integrationspfade sind erlaubt, keine externen URLs.",
      inputSchema: {
        method: z.enum(["GET", "POST", "PATCH", "DELETE"]).default("GET"),
        path: z.string().trim().regex(/^\/api\/integrations\/v1\/[a-zA-Z0-9/_?=&.%:-]*$/),
        query: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
        body: z.unknown().optional()
      }
    },
    async ({ method, path, query, body }) => jsonContent(await portal.json({ method, path, query, body }))
  );
}

type IntegrationDocumentLike = {
  id: string;
  filename?: string | null;
  title?: string | null;
  tenantProfileId?: string | null;
  propertyId?: string | null;
  unitId?: string | null;
  categoryId?: string | null;
  scope?: string | null;
  status?: string | null;
  ocrStatus?: string | null;
  ocrProcessedAt?: string | null;
  ocrError?: string | null;
  links?: {
    preview?: string | null;
    download?: string | null;
  } | null;
};

function documentToolResult(
  document: IntegrationDocumentLike,
  options: {
    categoryName?: string | null;
    categoryId?: string | null;
    message: string;
  }
) {
  return {
    success: true,
    documentId: document.id,
    filename: document.filename || "",
    title: document.title || null,
    tenantProfileId: document.tenantProfileId || null,
    propertyId: document.propertyId || null,
    unitId: document.unitId || null,
    categoryId: options.categoryId ?? document.categoryId ?? null,
    categoryName: options.categoryName ?? null,
    scope: document.scope || null,
    status: document.status || null,
    ocrStatus: document.ocrStatus || null,
    ocrProcessedAt: document.ocrProcessedAt || null,
    ocrError: document.ocrError || null,
    previewUrl: document.links?.preview || null,
    downloadUrl: document.links?.download || null,
    message: options.message,
    document
  };
}

type ResolvedUploadPayload = {
  fileBase64: string;
  filename: string;
  mimeType: string;
  size: number;
};

type UploadedFileLike = {
  path?: string;
  filename?: string;
  name?: string;
  mimeType?: string;
  type?: string;
  data?: string;
  base64?: string;
  url?: string;
  fileId?: string;
};

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png"
]);

async function resolveUploadPayload(
  file: unknown,
  fileBase64?: string,
  fallbackFilename?: string,
  fallbackMimeType?: string
): Promise<ResolvedUploadPayload> {
  let buffer: Buffer | null = null;
  let filename = fallbackFilename || "dokument.pdf";
  let mimeType = fallbackMimeType || "application/octet-stream";

  if (file !== undefined && file !== null) {
    if (typeof file !== "object") {
      throw new Error("Keine gueltige Datei uebergeben.");
    }
    const uploaded = file as UploadedFileLike;
    filename = fallbackFilename || uploaded.filename || uploaded.name || filename;
    mimeType = fallbackMimeType || uploaded.mimeType || uploaded.type || mimeType;

    if (uploaded.path) {
      buffer = await readFile(uploaded.path);
    } else if (uploaded.base64 || uploaded.data) {
      buffer = decodeBase64File(uploaded.base64 || uploaded.data || "");
    } else if (uploaded.url) {
      buffer = await downloadAllowedFile(uploaded.url);
    } else if (uploaded.fileId) {
      throw new Error("fileId kann von diesem MCP-Server nicht direkt aufgeloest werden. Bitte Dateiinhalt als file.data/base64 oder file.path uebergeben.");
    } else {
      throw new Error("Die Datei enthaelt weder Pfad, Base64-Daten, URL noch aufloesbare File-ID.");
    }
  } else if (fileBase64) {
    buffer = decodeBase64File(fileBase64);
  }

  if (!buffer) throw new Error("Keine Datei uebergeben. Bitte file oder fileBase64 angeben.");
  if (!buffer.length) throw new Error("Datei ist leer.");
  if (buffer.length > MAX_UPLOAD_BYTES) throw new Error("Datei ist zu gross. Maximal erlaubt sind 25 MB.");

  filename = sanitizeFilename(filename);
  mimeType = detectMimeType(buffer, filename, mimeType);
  validateUploadType(buffer, mimeType);

  return {
    fileBase64: buffer.toString("base64"),
    filename,
    mimeType,
    size: buffer.length
  };
}

function decodeBase64File(value: string): Buffer {
  const cleanBase64 = value.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
  if (!cleanBase64) throw new Error("fileBase64 ist leer.");
  if (!/^[A-Za-z0-9+/=_-]+$/.test(cleanBase64)) throw new Error("fileBase64 ist ungueltig.");
  return Buffer.from(cleanBase64, cleanBase64.includes("-") || cleanBase64.includes("_") ? "base64url" : "base64");
}

async function downloadAllowedFile(urlString: string): Promise<Buffer> {
  const url = new URL(urlString);
  if (url.protocol !== "https:") throw new Error("Nur HTTPS-Dateien sind erlaubt.");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local") || isPrivateIp(hostname)) {
    throw new Error("Lokale oder private Hosts sind fuer Datei-Downloads nicht erlaubt.");
  }
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Dateidownload fehlgeschlagen: HTTP ${response.status}`);
  const declaredLength = Number(response.headers.get("content-length") || "0");
  if (declaredLength > MAX_UPLOAD_BYTES) throw new Error("Datei ist zu gross. Maximal erlaubt sind 25 MB.");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_UPLOAD_BYTES) throw new Error("Datei ist zu gross. Maximal erlaubt sind 25 MB.");
  return buffer;
}

function isPrivateIp(hostname: string) {
  if (!isIP(hostname)) return false;
  if (hostname === "127.0.0.1" || hostname === "::1" || hostname === "0.0.0.0") return true;
  if (hostname.startsWith("10.") || hostname.startsWith("192.168.")) return true;
  const parts = hostname.split(".").map((part) => Number(part));
  return parts.length === 4 && (
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 169 && parts[1] === 254)
  );
}

function sanitizeFilename(filename: string) {
  const cleaned = filename
    .replace(/\s*\(\d+\)(?=\.[^.]+$)/, "")
    .replace(/\s+-\s+Kopie(?=\.[^.]+$)/i, "")
    .replace(/\s+Kopie(?=\.[^.]+$)/i, "")
    .replace(/[\/\\:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "dokument.pdf";
}

function detectMimeType(buffer: Buffer, filename: string, providedMimeType: string) {
  if (buffer.subarray(0, 4).toString("latin1") === "%PDF") return "application/pdf";
  if (buffer.subarray(0, 4).toString("hex") === "504b0304") {
    const lower = filename.toLowerCase();
    if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (lower.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (buffer.subarray(0, 3).toString("hex") === "ffd8ff") return "image/jpeg";
  if (buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return "image/png";
  return providedMimeType || "application/octet-stream";
}

function validateUploadType(buffer: Buffer, mimeType: string) {
  if (!ALLOWED_MIME_TYPES.has(mimeType)) throw new Error(`Dateityp nicht erlaubt: ${mimeType}`);
  if (mimeType === "application/pdf" && buffer.subarray(0, 4).toString("latin1") !== "%PDF") {
    throw new Error("Dateityp nicht erlaubt: PDF-Signatur fehlt.");
  }
}

async function resolveDocumentCategoryId(portal: PortalClient, categoryName: string, categoryGroup: string, createIfMissing: boolean) {
  const categories = await portal.json<{ items?: Array<{ id: string; name: string; group?: string | null }> }>({
    path: "/api/integrations/v1/document-categories"
  });
  const wanted = normalizeLookup(categoryName);
  const group = normalizeLookup(categoryGroup);
  const exact = categories.items?.find((category) =>
    normalizeLookup(category.name) === wanted && (!category.group || normalizeLookup(category.group) === group)
  );
  if (exact) return exact.id;

  const loose = categories.items?.find((category) => normalizeLookup(category.name) === wanted);
  if (loose) return loose.id;

  const stem = categories.items?.find((category) => {
    const normalizedName = normalizeLookup(category.name);
    return normalizedName.startsWith(wanted) || wanted.startsWith(normalizedName);
  });
  if (stem) return stem.id;

  if (!createIfMissing) {
    throw new Error(`Dokumentkategorie '${categoryName}' wurde nicht gefunden.`);
  }

  const created = await portal.json<{ id: string }>({
    method: "POST",
    path: "/api/integrations/v1/document-categories",
    body: {
      group: categoryGroup,
      name: categoryName,
      description: `Automatisch fuer MCP-Uploads angelegt: ${categoryName}`,
      visibleToBroker: false,
      visibleToTenant: false
    }
  });
  return created.id;
}

function normalizeLookup(value: string) {
  return value
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/Ä/g, "ae")
    .replace(/Ö/g, "oe")
    .replace(/Ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toLowerCase();
}

function propertyInputShape() {
  return {
    name: z.string().trim().min(1).optional(),
    address: optionalString,
    street: optionalString,
    houseNumber: optionalString,
    postalCode: optionalString,
    city: optionalString,
    country: optionalString,
    latitude: z.number().optional().nullable(),
    longitude: z.number().optional().nullable(),
    objectType: optionalString,
    constructionYear: z.number().int().optional().nullable(),
    livingArea: money,
    usableArea: money,
    plotArea: money,
    rooms: money,
    unitCount: z.number().int().optional(),
    floor: optionalString,
    parkingSpaces: z.number().int().optional().nullable(),
    energyCertificate: optionalString,
    heatingType: optionalString,
    condition: optionalString,
    modernizations: optionalString,
    rentalStatus: optionalString,
    purchasePrice: money,
    expectedPurchasePrice: money,
    outstandingLoan: money,
    internalNotes: optionalString
  };
}

function unitInputShape() {
  return {
    propertyId: z.string().trim().min(1),
    unitNumber: z.string().trim().min(1).optional(),
    floor: optionalString,
    rooms: money,
    livingArea: money,
    rentAmount: money,
    garageRent: money,
    serviceCharges: money,
    warmRent: money,
    status: optionalString,
    isSharedHousing: z.boolean().optional()
  };
}

function tenantInputShape() {
  return {
    firstName: optionalString,
    lastName: optionalString,
    email: optionalString,
    username: optionalString,
    password: optionalString,
    unitId: optionalString.nullable(),
    birthdate: optionalString.nullable(),
    currentAddress: optionalString.nullable(),
    phone: optionalString.nullable(),
    moveInDate: optionalString.nullable(),
    moveOutDate: optionalString.nullable(),
    isCurrent: z.boolean().optional(),
    leaseStartDate: optionalString.nullable(),
    rentAmount: money,
    garageRent: money,
    serviceCharges: money,
    deposit: money,
    depositPaidAmount: money,
    depositPaidAt: optionalString.nullable(),
    depositReturnedAmount: money,
    depositReturnedAt: optionalString.nullable(),
    depositStatus: optionalString,
    occupantCount: z.number().int().optional().nullable(),
    bankAccount: optionalString.nullable(),
    rentDueDay: z.number().int().min(1).max(31).optional().nullable(),
    landlordBankAccount: optionalString.nullable(),
    landlordBankName: optionalString.nullable(),
    roomDescription: optionalString.nullable(),
    sharedRooms: optionalString.nullable(),
    steppedRent: optionalString.nullable(),
    contractNotes: optionalString.nullable(),
    pets: optionalString.nullable(),
    specialAgreements: optionalString.nullable()
  };
}

function netWorthAssetInputShape() {
  return {
    name: z.string().trim().min(1),
    type: z.enum(["ASSET", "LIABILITY"]).optional().describe("ASSET fuer positiven Vermoegenswert, LIABILITY fuer Verbindlichkeit."),
    manualValue: money.describe("Manueller Wert, wenn kein Bankkonto gemappt wird."),
    bankingAccountId: z.number().int().optional().nullable().describe("ID aus list_banking_accounts, falls dieser Wert direkt aus Banking kommen soll."),
    bankingAccountLabel: optionalString.nullable(),
    note: optionalString.nullable(),
    active: z.boolean().optional()
  };
}

function documentUpdateShape() {
  return {
    title: optionalString,
    filename: optionalString,
    status: z.enum(["MISSING", "REQUESTED", "AVAILABLE", "SHARED", "NOT_RELEVANT"]).optional(),
    scope: z.enum(["PROPERTY", "UNIT", "TENANT", "CONTRACT"]).optional(),
    propertyId: optionalString.nullable(),
    unitId: optionalString.nullable(),
    tenantProfileId: optionalString.nullable(),
    summary: optionalString.nullable(),
    tags: z.array(z.string()).optional(),
    categoryId: optionalString.nullable(),
    isPropertyImage: z.boolean().optional(),
    isPrimaryImage: z.boolean().optional(),
    documentYear: z.number().int().min(1900).max(2049).optional().nullable()
  };
}

function timelineEventInputShape() {
  return {
    propertyId: optionalString.nullable(),
    unitId: optionalString.nullable(),
    tenantProfileId: optionalString.nullable(),
    brokerUserId: optionalString.nullable(),
    eventType: z.enum([
      "NOTE",
      "MAINTENANCE_REPORTED",
      "MAINTENANCE_REPAIRED",
      "RENOVATION",
      "PURCHASE",
      "TENANT_MOVE_IN",
      "TENANT_MOVE_OUT",
      "DEPOSIT_PAID",
      "DEPOSIT_RETURNED",
      "RENT_PAID",
      "RENT_PARTIAL",
      "RENT_OPEN",
      "DUNNING",
      "CONTRACT_CREATED",
      "COST",
      "HOA_FEE",
      "HOA_RECONCILIATION",
      "BROKER"
    ]).optional(),
    title: z.string().trim().min(1).optional(),
    description: optionalString.nullable(),
    status: z.enum(["INFO", "OPEN", "IN_PROGRESS", "DONE", "PAID", "PARTIAL", "OVERDUE"]).optional(),
    eventDate: z.string().trim().min(1).optional(),
    endDate: optionalString.nullable(),
    dueDate: optionalString.nullable(),
    costAmount: money,
    costCurrency: optionalString,
    costCategory: optionalString.nullable(),
    isInternal: z.boolean().optional(),
    documentIds: z.array(z.string().trim().min(1)).optional(),
    metadata: z.unknown().optional()
  };
}
