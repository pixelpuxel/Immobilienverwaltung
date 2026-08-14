# Immobilienportal MCP Server

Remote-MCP-Server fuer das Immobilienportal. Der Server laeuft als eigener Docker-Container und steuert das Portal ausschliesslich ueber die versionierte Integrations-API:

```text
/api/integrations/v1/...
```

Dadurch bleiben Rollen, Portalinstanzen, Scopes, Audit-Logs und Datei-Schutz im bestehenden Portal erhalten.

## Architektur

```text
ChatGPT / MCP Client
  -> HTTPS Reverse Proxy
    -> immobilienportal_mcp
      -> http://app:8088/api/integrations/v1/...
        -> Immobilienportal
```

Der MCP-Server greift nicht direkt auf PostgreSQL, Qdrant oder Upload-Verzeichnisse zu.

## Docker Compose

Der Service ist im Haupt-`docker-compose.yml` als `mcp` eingebunden.

Start:

```bash
docker compose up -d --build mcp
```

Oder zusammen mit dem gesamten Portal:

```bash
docker compose up -d --build
```

Healthcheck:

```bash
curl http://127.0.0.1:8090/health
```

MCP-Endpunkt:

```text
POST /mcp
Accept: application/json, text/event-stream
```

## OAuth fuer ChatGPT

ChatGPT-Apps/Plugins koennen den MCP-Server ueber OAuth verbinden. Der OAuth-Server ist das Immobilienportal selbst; der MCP-Container bleibt ein schlanker Tool-Proxy.

Discovery:

```text
GET https://portal.example.com/.well-known/oauth-protected-resource
GET https://portal.example.com/.well-known/oauth-authorization-server
```

Flow:

1. ChatGPT ruft `/mcp` ohne gueltigen Token auf.
2. Der MCP-Server antwortet `401` mit `WWW-Authenticate` und verweist auf die Protected-Resource-Metadata.
3. ChatGPT startet Authorization Code + PKCE gegen `/oauth/authorize`.
4. Der Benutzer loggt sich im Portal ein und bestaetigt die Rechte.
5. `/oauth/token` erzeugt einen normalen Portal-API-Token.
6. ChatGPT nutzt diesen Token als `Authorization: Bearer ...` fuer `/mcp`.

Die erzeugten OAuth-Tokens erscheinen im Portal unter **Einstellungen -> API-Zugaenge** und koennen dort widerrufen werden.

## ENV

```env
MCP_BIND=127.0.0.1
MCP_PORT=8090
MCP_SERVER_NAME=Immobilienportal MCP
MCP_SERVER_VERSION=0.1.0
MCP_PUBLIC_BASE_URL=https://portal.example.com
MCP_PORTAL_BASE_URL=http://app:8088
```

Zugriffstokens werden nicht in `.env` gespeichert. Der MCP-Server akzeptiert normale Portal-API-Tokens im Authorization-Header und verwendet denselben Token fuer die interne Integrations-API. Tokens werden im Portal unter **Einstellungen -> API-Zugaenge** administriert.

## Empfohlene Portal-Token-Scopes

Fuer einen vollstaendigen Admin-MCP:

```text
read:properties
write:properties
read:units
write:units
read:documents
write:documents
download:documents
read:tenants
write:tenants
read:contracts
write:contracts
read:timeline
write:timeline
read:audit
write:settings
backup:export
backup:import
```

Fuer einen sicheren Lesemodus:

```text
read:properties
read:units
read:documents
download:documents
read:tenants
read:contracts
read:timeline
read:audit
```

## ChatGPT-Anbindung

ChatGPT braucht fuer eigene MCP-Apps einen remote erreichbaren MCP-Server. Lokal gebundene Server sind nicht direkt erreichbar.

Empfohlen:

```text
https://portal.example.com/mcp
```

Reverse Proxy:

```nginx
location /mcp {
  proxy_pass http://127.0.0.1:8090/mcp;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

Fuer Clients ohne OAuth kann weiterhin ein manuell erzeugter Portal-API-Token genutzt werden:

```text
Authorization: Bearer <Portal-API-Token>
Accept: application/json, text/event-stream
```

## Werkzeuge

Der Server stellt fachliche Tools bereit, z. B.:

- `portal_health`
- `portal_me`
- `search_all`
- `ask_portal_agent`
- `get_agent_conversation`
- `reset_agent_conversation`
- `list_properties`
- `get_property`
- `create_property`
- `update_property`
- `list_units`
- `create_unit`
- `update_unit`
- `delete_unit`
- `list_tenants`
- `get_tenant`
- `create_tenant`
- `update_tenant`
- `list_tenant_documents`
- `create_landlord_confirmation`
- `list_documents`
- `list_document_categories`
- `upload_document`
- `upload_inbox_document`
- `classify_document`
- `upload_tenant_document`
- `update_document`
- `delete_document`
- `get_document_links`
- `get_document_ocr`
- `run_document_ocr`
- `list_contract_templates`
- `derive_contract_template`
- `create_contract`
- `create_contract_from_query`
- `list_contracts`
- `delete_contract`
- `get_contract_links`
- `list_rent_payments`
- `upsert_rent_payment`
- `list_timeline_events`
- `create_timeline_event`
- `update_timeline_event`
- `delete_timeline_event`
- `list_todos`
- `list_audit_logs`
- `list_users`
- `update_user`
- `list_portal_instances`
- `switch_portal_instance`
- `list_banking_accounts`
- `get_net_worth_summary`
- `list_net_worth_assets`
- `create_net_worth_asset`
- `update_net_worth_asset`
- `delete_net_worth_asset`
- `update_property_finance`
- `list_property_loan_account_mappings`
- `map_property_loan_account`
- `unmap_property_loan_account`
- `sync_net_worth_from_banking`
- `integration_api_request`

`integration_api_request` ist ein kontrollierter Fallback fuer neue Portal-Endpunkte. Er erlaubt nur relative Pfade unter `/api/integrations/v1/...` und keine externen URLs.

Dokument-Uploads sollen bevorzugt ueber `upload_document` erfolgen. Das Tool akzeptiert bevorzugt einen Chat-/MCP-Dateianhang im Feld `file` und weiterhin `fileBase64` als Rueckfall. Weitere Felder sind `filename`, optional `mimeType`, `title`, `propertyId`, `unitId`, `tenantProfileId`, `categoryId`, `summary`, `tags`, `documentYear` und `runOcr`.


### Direktdownload von Dokumenten als MCP-Datei

`get_document_links` erzeugt signierte Portal-Links fuer Browser, Vorschau und manuelles Oeffnen. Das reicht nicht, wenn ein MCP-Client die Datei selbst weiterverarbeiten soll, zum Beispiel um ein Immobilienfoto in ein PDF einzubauen.

Dafuer muss `download_document` verwendet werden. Das Tool:

- nimmt `documentId` entgegen;
- ruft intern ausschliesslich `/api/integrations/v1/documents/:id/download` mit dem Bearer-Token auf;
- gibt keine internen Storage-Pfade aus;
- gibt nicht nur eine URL aus;
- liefert standardmaessig einen MCP-`resource_link`, damit grosse Dateien nicht als riesige Tool-Antwort scheitern;
- der Dateiinhalt wird anschliessend direkt per `resources/read` auf die `immoportal://documents/:documentId`-Resource geladen;
- kann mit `embed: true` kleine Dateien weiterhin direkt als eingebettete MCP-Resource mit `resource.blob` Base64 zurueckgeben;
- besitzt ein `outputSchema`, damit ChatGPT das Tool sauber validieren kann.

Wichtig fuer zukuenftige Aenderungen: Ein Tool gilt erst als verfuegbar, wenn es in `mcp-server/src/tools.ts` wirklich per `server.registerTool(...)` registriert ist. Eine Beschreibung im Prompt, README oder in einer API-Doku reicht nicht. Nach jedem MCP-Tool-Umbau muessen mindestens diese Tests laufen:

```bash
# 1. Tool muss in tools/list auftauchen
cat >/tmp/mcp-tools-list.json <<JSON
{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}
JSON
curl -s -X POST https://portal.schreiber.info/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  --data @/tmp/mcp-tools-list.json | grep download_document

# 2. Tool muss aufrufbar sein und einen Resource-Link liefern
cat >/tmp/mcp-download-document.json <<JSON
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"download_document","arguments":{"documentId":"cmqfk7stx000t3hw1yrdlfscz"}}}
JSON
curl -s -X POST https://portal.schreiber.info/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  --data @/tmp/mcp-download-document.json

# 3. Dateiinhalt direkt ueber die MCP-Resource lesen
cat >/tmp/mcp-read-document-resource.json <<JSON
{"jsonrpc":"2.0","id":3,"method":"resources/read","params":{"uri":"immoportal://documents/cmqfk7stx000t3hw1yrdlfscz"}}
JSON
curl -s -X POST https://portal.schreiber.info/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  --data @/tmp/mcp-read-document-resource.json
```

OCR:

- `runOcr: true` fuehrt beim Upload OCR fuer PDF- und Bilddateien aus.
- `run_document_ocr` verarbeitet ein bestehendes Dokument nachtraeglich.
- `get_document_ocr` liefert Status, Fehler und erkannten Text.
- OCR-Text wird im Portal gespeichert und in die strukturierte sowie semantische Suche aufgenommen.

Vermoegen und Darlehen:

- `list_banking_accounts` liest die verfuegbaren Bankkonten aus der Banking-API.
- `get_net_worth_summary` liefert Immobilienwerte, Darlehen, sonstige Werte und Gesamt-Nettowert.
- `update_property_finance` setzt gezielt Immobilien-Finanzfelder: `purchasePrice` ist der echte historische Kaufpreis, `expectedPurchasePrice` die aktuelle Kaufpreisvorstellung/Markterwartung, `outstandingLoan` das valutierte Darlehen. Diese Felder duerfen nicht miteinander vermischt werden.
- `map_property_loan_account` verknuepft ein Bankkonto als Darlehenskonto mit einer Immobilie.
- `sync_net_worth_from_banking` aktualisiert die valutierten Darlehen und gemappte sonstige Vermoegenswerte.
- `create_net_worth_asset` legt freie Vermoegenswerte/Verbindlichkeiten an oder mappt Girokonto, Tagesgeld, Festgeld oder andere Konten.

Mieterdokumente wie Kuendigungen, Kautionsnachweise oder persoenliche Mietvertraege sollen bevorzugt ueber `upload_tenant_document` hochgeladen werden. Das Tool akzeptiert `tenantProfileId`, `file` oder `fileBase64`, `filename`, optional `categoryName` wie `Kuendigungen` und loest die Dokumentkategorie intern auf.

Wenn die fachliche Einsortierung noch unklar ist, ist der Standardablauf zweistufig:

1. `upload_inbox_document` speichert den Chat-Anhang neutral im Dokumenteneingang.
2. `classify_document` setzt danach Immobilie, Einheit, Mieter, Kategorie, Beschreibung, Tags, Jahr und optionale Verknuepfungen.

Der MCP-Server liest Datei-Anhaenge serverseitig. Unterstuetzt werden Dateiobjekte mit `path`, `filename`/`name`, `mimeType`/`type`, `data`/`base64` oder sichere HTTPS-URLs. Automatische Dubletten-Zusaetze wie `(1)`, `(2)` und `Kopie` werden aus Dateinamen entfernt. Erlaubt sind PDF, DOCX, XLSX, JPG und PNG bis 25 MB.

## Sicherheitsmodell

- MCP-Clients bekommen keinen direkten Datenbankzugriff.
- Datei-Links werden ueber geschuetzte Portalrouten erzeugt.
- Interne Dateipfade werden nicht ausgegeben.
- Portalrechte und Portalinstanzen werden vom Immobilienportal durchgesetzt.
- Schreibaktionen brauchen passende Portal-API-Scopes.
- Der MCP-Endpunkt selbst ist per Bearer Token geschuetzt.

## Eigenes GitHub-Repository

Der Ordner ist bewusst eigenstaendig gehalten. Er kann spaeter separat versioniert werden:

```bash
git subtree split --prefix=mcp-server -b mcp-server-main
```

Danach kann dieser Branch in ein eigenes Repository gepusht werden.
