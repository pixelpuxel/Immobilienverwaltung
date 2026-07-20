import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PortalClient } from "./portal-client.js";
import { jsonContent, textContent } from "./format.js";

const optionalString = z.string().trim().optional();
const optionalId = z.string().trim().min(1).optional();
const money = z.union([z.string(), z.number()]).optional().nullable();

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
      description: "Erzeugt autorisierte Integrations-Links fuer Vorschau und Download eines Dokuments.",
      inputSchema: {
        id: z.string().trim().min(1)
      }
    },
    async ({ id }) => textContent([
      "Autorisierte Dokumentlinks:",
      `Vorschau: ${portal.integrationUrl(`/api/integrations/v1/documents/${encodeURIComponent(id)}/preview`)}`,
      `Download: ${portal.integrationUrl(`/api/integrations/v1/documents/${encodeURIComponent(id)}/download`)}`
    ].join("\n"))
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
      description: "Erzeugt autorisierte Integrations-Downloadlinks fuer DOCX und PDF.",
      inputSchema: {
        id: z.string().trim().min(1)
      }
    },
    async ({ id }) => textContent([
      "Autorisierte Vertragslinks:",
      `PDF: ${portal.integrationUrl(`/api/integrations/v1/contracts/${encodeURIComponent(id)}/download`, { format: "pdf" })}`,
      `DOCX: ${portal.integrationUrl(`/api/integrations/v1/contracts/${encodeURIComponent(id)}/download`, { format: "docx" })}`
    ].join("\n"))
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
