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
- `upload_document`
- `update_document`
- `delete_document`
- `get_document_links`
- `list_contract_templates`
- `derive_contract_template`
- `create_contract`
- `create_contract_from_query`
- `list_contracts`
- `delete_contract`
- `get_contract_links`
- `list_rent_payments`
- `upsert_rent_payment`
- `list_todos`
- `list_audit_logs`
- `list_users`
- `update_user`
- `list_portal_instances`
- `switch_portal_instance`
- `integration_api_request`

`integration_api_request` ist ein kontrollierter Fallback fuer neue Portal-Endpunkte. Er erlaubt nur relative Pfade unter `/api/integrations/v1/...` und keine externen URLs.

Dokument-Uploads sollen bevorzugt ueber `upload_document` erfolgen. Das Tool erwartet `fileBase64`, `filename`, optional `mimeType`, `title`, `propertyId`, `unitId`, `tenantProfileId`, `categoryId`, `summary`, `tags` und `documentYear`.

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
