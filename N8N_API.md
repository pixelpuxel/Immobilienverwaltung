# N8N API-Schnittstelle

## Ziel

N8N soll das Immobilienportal automatisiert ansprechen koennen, ohne sich wie ein Browser per Login-Formular und Session-Cookie anmelden zu muessen. Dafuer sollte das Portal eine stabile, dokumentierte Integrations-API mit Bearer Tokens bekommen.

Die bestehende Web-API bleibt fuer die Oberflaeche erhalten. Fuer N8N wird eine eigene Integrationsschicht empfohlen:

```text
Authorization: Bearer <API_TOKEN>
```

## Empfehlung

Ich empfehle eine eigene Tabelle `ApiToken` und eigene Routen unter `/api/integrations/v1/...`.

Vorteile:

- N8N braucht keinen Passwort-Login und keine Cookie-Verwaltung.
- Tokens koennen einzeln widerrufen werden, ohne Benutzerpasswoerter zu aendern.
- Zugriffe koennen auf eine Portal-Instanz und auf Rollen/Rechte begrenzt werden.
- Automationen werden im Audit-Log klar als Integration erkennbar.
- Spaetere Erweiterungen bleiben stabil, weil N8N nicht an UI-interne Endpunkte gekoppelt ist.

## Rollenmodell fuer Tokens

Ein API-Token sollte immer an einen echten Portal-Benutzer gebunden sein, meistens an einen Admin-/Eigentuemerkonto.

Empfohlenes Datenmodell:

```prisma
model ApiToken {
  id              String    @id @default(cuid())
  portalInstanceId String?
  userId          String
  name            String
  tokenHash       String    @unique
  scopes          String[]  @default([])
  lastUsedAt      DateTime?
  expiresAt       DateTime?
  revokedAt       DateTime?
  createdAt       DateTime  @default(now())
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  portalInstance  PortalInstance? @relation(fields: [portalInstanceId], references: [id], onDelete: Cascade)
}
```

Der Klartext-Token wird nur einmal beim Erstellen angezeigt. In der Datenbank wird nur ein Hash gespeichert.

## Token-Format

Beispiel:

```text
ip_live_9J2h7qJk3F...langer-zufaelliger-wert
```

Empfohlen:

- mindestens 32 Byte Zufall
- Praefix `ip_live_` fuer produktive Tokens
- Praefix `ip_test_` fuer Testtokens, falls spaeter Sandbox/Tests kommen
- Hashing in der Datenbank per SHA-256 oder HMAC-SHA-256

## Scopes

Scopes sollten moeglichst klein und klar sein:

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
backup:export
backup:import
```

Fuer einen typischen N8N-Start wuerde ich diese Token-Arten vorsehen:

### Lesen und Auswerten

```text
read:properties
read:units
read:documents
read:tenants
read:contracts
```

### Dokumentenautomation

```text
read:properties
read:units
read:documents
write:documents
download:documents
```

### Voller Admin-Import/Export

```text
backup:export
backup:import
read:properties
read:units
read:documents
read:tenants
read:contracts
```

## HTTP-Konventionen

Basis-URLs:

```text
NAS: https://oder-http://NAS-IP:8088
VPS: https://portal.example.com
```

Header:

```http
Authorization: Bearer <API_TOKEN>
Accept: application/json
Content-Type: application/json
```

Bei Datei-Uploads:

```http
Authorization: Bearer <API_TOKEN>
Accept: application/json
Content-Type: multipart/form-data
```

## Fehlerformat

Alle Integrations-Endpunkte sollten einheitlich antworten:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Token hat nicht den benoetigten Scope.",
    "requestId": "req_..."
  }
}
```

Empfohlene Statuscodes:

```text
200 OK
201 Created
204 No Content
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
413 Payload Too Large
429 Too Many Requests
500 Internal Server Error
```

## Versionierung

N8N sollte nur versionierte Routen nutzen:

```text
/api/integrations/v1/...
```

Wenn sich spaeter Datenstrukturen aendern, kann `/v2` parallel entstehen.

## Empfohlene Endpunkte

### Healthcheck

```http
GET /api/integrations/v1/health
```

Antwort:

```json
{
  "ok": true,
  "portal": "Immobilienportal",
  "version": "1",
  "time": "2026-06-01T10:00:00.000Z"
}
```

### Aktueller API-Benutzer

```http
GET /api/integrations/v1/me
```

Antwort:

```json
{
  "user": {
    "id": "cm...",
    "email": "admin@example.com",
    "role": "ADMIN",
    "portalInstanceId": "cm..."
  },
  "token": {
    "name": "n8n produktiv",
    "scopes": ["read:properties", "read:documents"]
  }
}
```

### Immobilien listen

```http
GET /api/integrations/v1/properties
```

Query-Parameter:

```text
q=Suchbegriff
limit=50
cursor=<cursor>
updatedSince=2026-06-01T00:00:00.000Z
```

Antwort:

```json
{
  "items": [
    {
      "id": "cm...",
      "name": "Musterstraße 12, Musterstadt",
      "address": "Musterstraße 12, Musterstadt",
      "street": "Musterstraße",
      "houseNumber": "14",
      "postalCode": "12345",
      "city": "Musterstadt",
      "expectedPurchasePrice": "845000.00",
      "outstandingLoan": "0.00",
      "rentalStatus": "teilvermietet",
      "updatedAt": "2026-06-01T10:00:00.000Z"
    }
  ],
  "nextCursor": null
}
```

### Immobilie abrufen

```http
GET /api/integrations/v1/properties/:id
```

Optional mit Unterdaten:

```text
?include=units,documents,tenants,images
```

### Immobilie anlegen

Scope: `write:properties`

```http
POST /api/integrations/v1/properties
```

Body:

```json
{
  "name": "Musterstrasse 1",
  "street": "Musterstrasse",
  "houseNumber": "1",
  "postalCode": "12345",
  "city": "Musterstadt",
  "objectType": "Wohnimmobilie"
}
```

### Immobilie aktualisieren

Scope: `write:properties`

```http
PATCH /api/integrations/v1/properties/:id
```

Body:

```json
{
  "expectedPurchasePrice": "600000",
  "outstandingLoan": "250000",
  "rentalStatus": "vermietet"
}
```

### Einheiten listen

```http
GET /api/integrations/v1/units?propertyId=<PROPERTY_ID>
```

### Einheit aktualisieren

Scope: `write:units`

```http
PATCH /api/integrations/v1/units/:id
```

Body:

```json
{
  "rentAmount": "500",
  "garageRent": "100",
  "serviceCharges": "160",
  "warmRent": "760"
}
```

### Dokumente listen

```http
GET /api/integrations/v1/documents
```

Query-Parameter:

```text
propertyId=<PROPERTY_ID>
unitId=<UNIT_ID>
categoryId=<CATEGORY_ID>
q=Suchbegriff
limit=50
cursor=<cursor>
updatedSince=2026-06-01T00:00:00.000Z
```

Antwort:

```json
{
  "items": [
    {
      "id": "cm...",
      "title": "Grundbuchauszug",
      "filename": "grundbuch.pdf",
      "mimeType": "application/pdf",
      "size": 123456,
      "status": "AVAILABLE",
      "scope": "PROPERTY",
      "propertyId": "cm...",
      "unitId": null,
      "category": {
        "group": "Allgemein",
        "name": "Grundbuchauszug"
      },
      "summary": "- Grundbuchauszug\n- Bezug: Musterstraße 12\n- Enthält Eigentums- und Flurstuecksdaten",
      "tags": ["Grundbuch", "Verkauf", "Musterstraße"],
      "previewUrl": "/api/integrations/v1/documents/cm.../preview",
      "downloadUrl": "/api/integrations/v1/documents/cm.../download"
    }
  ],
  "nextCursor": null
}
```

### Dokument hochladen

Scope: `write:documents`

```http
POST /api/integrations/v1/documents
Content-Type: multipart/form-data
```

Form-Felder:

```text
file=@grundbuch.pdf
title=Grundbuchauszug
propertyId=<PROPERTY_ID>
unitId=<UNIT_ID optional>
categoryId=<CATEGORY_ID optional>
status=AVAILABLE
scope=PROPERTY
summary=Beispiele Beschreibung
tags=Grundbuch,Verkauf,Musterstraße
```

### Dokument-Vorschau

Scope: `read:documents`

```http
GET /api/integrations/v1/documents/:id/preview
```

### Dokument-Download

Scope: `download:documents`

```http
GET /api/integrations/v1/documents/:id/download
```

### Mieter listen

```http
GET /api/integrations/v1/tenants?propertyId=<PROPERTY_ID>&current=true
```

### Mieter aktualisieren

Scope: `write:tenants`

```http
PATCH /api/integrations/v1/tenants/:id
```

Body:

```json
{
  "phone": "+49 ...",
  "moveInDate": "2024-09-30",
  "moveOutDate": null,
  "isCurrent": true
}
```

### Verträge listen

```http
GET /api/integrations/v1/contracts?tenantId=<TENANT_ID>
```

### Vertrag erzeugen

Scope: `write:contracts`

```http
POST /api/integrations/v1/contracts
```

Body:

```json
{
  "tenantProfileId": "cm...",
  "unitId": "cm...",
  "templateId": "cm..."
}
```

`templateId` ist optional. Ohne Vorlage erzeugt das Portal den internen Standardvertrag.

### Vertragsvorlagen listen

Scope: `read:contracts`

```http
GET /api/integrations/v1/templates
```

### Suche

```http
GET /api/integrations/v1/search?q=tirol
```

Antwort:

```json
{
  "items": [
    {
      "type": "property",
      "id": "cm...",
      "title": "Musterstraße 12, Musterstadt",
      "description": "Wohnimmobilie · teilvermietet",
      "url": "/api/integrations/v1/properties/cm..."
    }
  ]
}
```

### Backup exportieren

Scope: `backup:export`

```http
GET /api/integrations/v1/backup/export?includeFiles=true
```

### Backup importieren

Scope: `backup:import`

```http
POST /api/integrations/v1/backup/import
Content-Type: multipart/form-data
```

Form-Felder:

```text
file=@immobilienportal-backup.json
replaceExisting=true
importFiles=true
```

## N8N-Konfiguration

In N8N reicht fuer viele Workflows ein HTTP Request Node.

Credential-Typ:

```text
Header Auth
```

Header:

```text
Name: Authorization
Value: Bearer ip_live_DEIN_TOKEN
```

Zusaetzliche Header:

```text
Accept: application/json
```

Fuer JSON-POST/PATCH:

```text
Content-Type: application/json
```

## Beispiel: Immobilien aus N8N lesen

HTTP Request Node:

```text
Method: GET
URL: https://portal.example.com/api/integrations/v1/properties?limit=50
Authentication: Header Auth
Response Format: JSON
```

## Beispiel: Dokument hochladen

HTTP Request Node:

```text
Method: POST
URL: https://portal.example.com/api/integrations/v1/documents
Authentication: Header Auth
Send Body: Form-Data
```

Form-Data:

```text
file: Binary Property aus vorherigem Node
title: {{$json.title}}
propertyId: {{$json.propertyId}}
categoryId: {{$json.categoryId}}
status: AVAILABLE
scope: PROPERTY
```

## Sicherheit

Empfohlene Regeln:

- Tokens nie im Workflow-JSON hart eintragen, sondern als N8N Credential speichern.
- Pro Workflow oder System ein eigener Token.
- Tokens mit Ablaufdatum versehen, wenn sie nur temporaer gebraucht werden.
- Nur benoetigte Scopes vergeben.
- Token-Erstellung und Token-Nutzung im Audit-Log protokollieren.
- Bei Verdacht Token sofort widerrufen.
- Rate-Limits pro Token einfuehren, zum Beispiel 60 Requests pro Minute.
- Datei-Downloads nur ueber autorisierte Backend-Routen erlauben, nicht ueber oeffentliche Pfade.

## Implementierungsstand

Umgesetzt ist die produktive erste Integrationsstufe:

```text
GET  /api/integrations/v1/health
GET  /api/integrations/v1/me
GET  /api/integrations/v1/properties
POST /api/integrations/v1/properties
GET  /api/integrations/v1/properties/:id
PATCH /api/integrations/v1/properties/:id
GET  /api/integrations/v1/units
POST /api/integrations/v1/units
PATCH /api/integrations/v1/units/:id
GET  /api/integrations/v1/documents
POST /api/integrations/v1/documents
GET  /api/integrations/v1/documents/:id/preview
GET  /api/integrations/v1/documents/:id/download
GET  /api/integrations/v1/tenants
PATCH /api/integrations/v1/tenants/:id
GET  /api/integrations/v1/contracts
POST /api/integrations/v1/contracts
GET  /api/integrations/v1/templates
GET  /api/integrations/v1/search
GET  /api/integrations/v1/backup/export
POST /api/integrations/v1/backup/import
```

Der Import-Endpunkt ist aus Sicherheitsgruenden zunaechst nur als vorbereitete Route vorhanden und antwortet mit `501 NOT_IMPLEMENTED`. Fuer produktive Imports bleibt vorerst der bestehende Cookie-Endpunkt `/api/backup/import` die freigeschaltete Variante.

API-Tokens koennen in der Oberflaeche unter `Einstellungen -> N8N API-Tokens` erstellt und widerrufen werden.

## Umsetzungsvorschlag in Etappen

### Etappe 1: Lesen und Suchen

- `ApiToken` Modell
- Token-Hashing
- `requireIntegrationUser(request, scopes)`
- `GET /api/integrations/v1/health`
- `GET /api/integrations/v1/me`
- `GET /api/integrations/v1/properties`
- `GET /api/integrations/v1/properties/:id`
- `GET /api/integrations/v1/documents`
- `GET /api/integrations/v1/search`

### Etappe 2: Schreiben und Uploads

- `POST/PATCH /properties`
- `POST/PATCH /units`
- `POST /documents`
- `PATCH /documents/:id`
- `PATCH /tenants/:id`

### Etappe 3: Backup und Admin

- Backup Export/Import ueber Token
- Token-Verwaltung in den Einstellungen
- Token-Widerruf
- Last-used Anzeige
- Rate-Limiting

## Warum nicht einfach Login-Cookie fuer N8N?

Das geht heute theoretisch bereits ueber `/api/auth/login`, ist aber fuer Automationen unpraktisch:

- N8N muss Cookies verwalten.
- CSRF-Origin-Header muessen passen.
- Session laeuft nach 12 Stunden ab.
- Passwort muss in N8N gespeichert werden.
- Kein einfaches Widerrufen einzelner Workflows.

Deshalb ist Bearer Token Auth fuer N8N die bessere Loesung.
