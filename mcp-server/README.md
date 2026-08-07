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

### Benutzergebundene MCP-Routen

Neben der Standardroute kann ein Connector gezielt an einen Portalbenutzer gebunden werden:

```text
https://portal.example.com/mcp
https://portal.example.com/mcp/maren
```

`/mcp` nutzt den Benutzer, der den OAuth-Flow bestaetigt. `/mcp/<benutzer>` erwartet, dass der OAuth-Flow vom passenden Zielbenutzer oder von einem Plattform-Admin bestaetigt wird. Der erzeugte API-Token gehoert dann zu diesem Zielbenutzer und sieht nur dessen Portalinstanz und Rechte.

Der Pfadbestandteil `<benutzer>` kann Benutzername, Benutzer-ID oder E-Mail ohne Sonderzeichen sein; fuer ChatGPT-Connectoren ist ein kurzer eindeutiger Benutzername wie `maren` vorgesehen. Der MCP-Server prueft bei jedem Request zusaetzlich `/api/integrations/v1/me`: Ein Token fuer Gabriel wird auf `/mcp/maren` mit `403 FORBIDDEN` abgelehnt.

Discovery fuer eine profilgebundene Route:

```text
GET https://portal.example.com/.well-known/oauth-protected-resource/maren
POST https://portal.example.com/mcp/maren
```

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
- `search_units`
- `create_unit`
- `update_unit`
- `update_unit_rent_details`
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
- `download_document`
- `get_document_links`
- `list_contract_templates`
- `derive_contract_template`
- `create_contract`
- `create_contract_from_query`
- `list_contracts`
- `delete_contract`
- `get_contract_links`
- `get_transaction_details`
- `list_rent_payments`
- `upsert_rent_payment`
- `get_service_charge_workspace`
- `save_service_charge_rule`
- `add_service_charge_line`
- `delete_service_charge_line`
- `list_service_charge_statements`
- `create_service_charge_statement`
- `get_service_charge_statement`
- `finalize_service_charge_statement`
- `delete_service_charge_statement`
- `get_service_charge_statement_links`
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
- `integration_api_request`

`integration_api_request` ist ein kontrollierter Fallback fuer neue Portal-Endpunkte. Er erlaubt nur relative Pfade unter `/api/integrations/v1/...` und keine externen URLs.

Dokument-Uploads sollen bevorzugt ueber `upload_document` erfolgen. Das Tool akzeptiert bevorzugt einen Chat-/MCP-Dateianhang im Feld `file` und weiterhin `fileBase64` als Rueckfall. Weitere Felder sind `filename`, optional `mimeType`, `title`, `propertyId`, `unitId`, `tenantProfileId`, `categoryId`, `summary`, `tags` und `documentYear`.

Mieterdokumente wie Kuendigungen, Kautionsnachweise oder persoenliche Mietvertraege sollen bevorzugt ueber `upload_tenant_document` hochgeladen werden. Das Tool akzeptiert `tenantProfileId`, `file` oder `fileBase64`, `filename`, optional `categoryName` wie `Kuendigungen` und loest die Dokumentkategorie intern auf.

Dokumente koennen mit `download_document` direkt als MCP-Datei/Resource geladen werden. Das Tool liefert Metadaten (`documentId`, `filename`, `mimeType`, `size`) und eine eingebettete Datei-Resource zurueck. Es nutzt keine signierte URL und keine frei uebergebenen Dateipfade. Der Portal-Endpunkt prueft `read:documents`, `download:documents`, Portalinstanz, Dokumentzugriff, erlaubten Dateityp und ein 25-MB-Limit. `get_document_links` bleibt fuer normale Portal-Links bestehen.

Wenn die fachliche Einsortierung noch unklar ist, ist der Standardablauf zweistufig:

1. `upload_inbox_document` speichert den Chat-Anhang neutral im Dokumenteneingang.
2. `classify_document` setzt danach Immobilie, Einheit, Mieter, Kategorie, Beschreibung, Tags, Jahr und optionale Verknuepfungen.

Banking-Buchungen koennen mit `get_transaction_details` ueber das Immoportal gelesen werden, sofern im Portal unter **Einstellungen -> Banking-Integration** ein Banking-API-Token hinterlegt ist. Das Tool ruft keine Banking-Datenbank direkt ab, sondern nutzt:

```text
/api/integrations/v1/banking/transactions/{transaction_id}/details
```

Die Antwort enthaelt die Rohbuchung, Kategorie/Unterkategorie, zugeordnete Immobilie, Einheit, Mieter, Vertrag, Notizen, OCR-/KI-Daten, verknuepfte Dokumente, Historie, Benutzerkommentare und die vollstaendige Split-Struktur. Falls das Banking-Portal selbst keinen Detail-Endpunkt liefert, setzt das Immoportal die Daten aus den vorhandenen Banking-Endpunkten fuer Buchung, Splits, Historie und Kommentare zusammen.

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
