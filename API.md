# Immobilienportal API

Diese Datei beschreibt die wichtigsten internen HTTP-Endpunkte des Portals. Die API ist aktuell vor allem fuer Admin-Werkzeuge, Backup/Restore und interne UI-Funktionen gedacht. Beispiele sind mit `curl` formuliert.

Fuer N8N und andere externe Automationen ist eine eigene Bearer-Token-Integrations-API empfohlen. Der Vorschlag und die geplanten Endpunkte stehen in [N8N_API.md](./N8N_API.md).

## Basis-URLs

NAS lokal:

```text
http://NAS-IP:8088
```

Google-VM:

```text
https://portal.example.com
```

In den Beispielen wird eine Variable verwendet:

```bash
BASE_URL="http://NAS-IP:8088"
```

Fuer die VM:

```bash
BASE_URL="https://portal.example.com"
```

Falls `curl` auf der VM wegen Zertifikat meckert, temporaer `-k` ergaenzen.

## Authentifizierung

Die API nutzt ein HTTP-only Session-Cookie `portal_session`. Fuer nicht-GET-Anfragen muss der `Origin`-Header zur Domain passen, sonst greift der CSRF-Schutz.

Login mit Benutzername oder E-Mail:

```bash
curl -c portal-cookie.txt \
  -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -H "Origin: $BASE_URL" \
  --data '{"identifier":"eigentuemer","password":"DEIN_PASSWORT"}'
```

Aktuelle Sitzung pruefen:

```bash
curl -b portal-cookie.txt "$BASE_URL/api/auth/me"
```

Logout:

```bash
curl -b portal-cookie.txt \
  -X POST "$BASE_URL/api/auth/logout" \
  -H "Origin: $BASE_URL"
```

## Backup Und Import

Backups werden pro Portal-Instanz exportiert. Ein normaler Eigentümer exportiert also nur seine eigene Instanz; Dokumente und Vertragsdateien koennen ueber `includeFiles=true` eingebettet werden.

Backup ohne Dateien:

```bash
curl -b portal-cookie.txt \
  "$BASE_URL/api/backup/export?includeFiles=false" \
  -o immobilienportal-backup-ohne-dateien.json
```

Backup mit Dokumenten, Vorlagen und generierten Vertraegen:

```bash
curl -b portal-cookie.txt \
  "$BASE_URL/api/backup/export?includeFiles=true" \
  -o immobilienportal-backup-mit-dateien.json
```

Import als vollstaendige Wiederherstellung, inklusive Dateien:

```bash
curl -b portal-cookie.txt \
  -X POST "$BASE_URL/api/backup/import" \
  -H "Origin: $BASE_URL" \
  -F "replaceExisting=true" \
  -F "importFiles=true" \
  -F "file=@immobilienportal-backup-mit-dateien.json;type=application/json"
```

Import ohne Loeschen vorhandener Daten:

```bash
curl -b portal-cookie.txt \
  -X POST "$BASE_URL/api/backup/import" \
  -H "Origin: $BASE_URL" \
  -F "replaceExisting=false" \
  -F "importFiles=true" \
  -F "file=@immobilienportal-backup-mit-dateien.json;type=application/json"
```

Import ohne enthaltene Dateien:

```bash
curl -b portal-cookie.txt \
  -X POST "$BASE_URL/api/backup/import" \
  -H "Origin: $BASE_URL" \
  -F "replaceExisting=true" \
  -F "importFiles=false" \
  -F "file=@immobilienportal-backup-ohne-dateien.json;type=application/json"
```

Hinweis fuer Reverse Proxy/Nginx: grosse Backups brauchen ein hoeheres Upload-Limit, zum Beispiel:

```nginx
client_max_body_size 1024m;
```

## Synchronisation VM Nach NAS

1. Auf der VM ein Backup mit Dateien exportieren.
2. Datei lokal speichern.
3. Am NAS einloggen.
4. Backup ins NAS importieren.

Beispiel fuer direkten Export von der VM:

```bash
VM_URL="https://portal.example.com"

curl -k -c vm-cookie.txt \
  -X POST "$VM_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -H "Origin: $VM_URL" \
  --data '{"identifier":"eigentuemer","password":"DEIN_PASSWORT"}'

curl -k -b vm-cookie.txt \
  "$VM_URL/api/backup/export?includeFiles=true" \
  -o vm-sync-export.json
```

Import ins NAS:

```bash
NAS_URL="http://NAS-IP:8088"

curl -c nas-cookie.txt \
  -X POST "$NAS_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -H "Origin: $NAS_URL" \
  --data '{"identifier":"eigentuemer","password":"DEIN_PASSWORT"}'

curl -b nas-cookie.txt \
  -X POST "$NAS_URL/api/backup/import" \
  -H "Origin: $NAS_URL" \
  -F "replaceExisting=true" \
  -F "importFiles=true" \
  -F "file=@vm-sync-export.json;type=application/json"
```

## Wichtige Endpunkte

Auth:

```text
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
POST /api/auth/switch-view
```

Backup:

```text
GET  /api/backup/export?includeFiles=true|false
POST /api/backup/import
```

Portal-Instanzen:

```text
GET  /api/portal-instances
POST /api/portal-instances
```

`/api/portal-instances` ist nur fuer den Plattform-Eigentuemer sichtbar. Damit wird eine neue, leere Instanz mit eigenem Eigentümerzugang angelegt.

Beispiel:

```bash
curl -b portal-cookie.txt \
  -X POST "$BASE_URL/api/portal-instances" \
  -H "Content-Type: application/json" \
  -H "Origin: $BASE_URL" \
  --data '{
    "name":"Immobilienportal Musterkunde",
    "slug":"musterkunde",
    "ownerName":"Max Muster",
    "ownerEmail":"max@example.com",
    "ownerUsername":"max",
    "ownerPassword":"BitteSofortAendern123!"
  }'
```

Immobilien und Einheiten:

```text
GET  /api/properties
POST /api/properties
GET  /api/properties/:id
PATCH /api/properties/:id
DELETE /api/properties/:id

GET  /api/units
POST /api/units
GET  /api/units/:id
PATCH /api/units/:id
DELETE /api/units/:id
```

Dokumente:

```text
GET  /api/documents
POST /api/documents
GET  /api/documents/:id
PATCH /api/documents/:id
DELETE /api/documents/:id
GET  /api/documents/:id/download
GET  /api/documents/:id/preview
GET  /api/documents/:id/thumbnail
```

Dokumentkategorien und Rechte:

```text
GET  /api/document-categories
PATCH /api/document-categories
POST /api/permissions
```

Benutzer:

```text
POST /api/admin-users
GET  /api/users/:id
PATCH /api/users/:id
DELETE /api/users/:id
GET  /api/users/:id/access
PATCH /api/users/:id/access
```

Makler:

```text
GET  /api/broker-requests
POST /api/broker-requests
GET  /api/broker-valuations
POST /api/broker-valuations
```

Mieter:

```text
GET  /api/tenants
POST /api/tenants
POST /api/tenants/:id/wohnungsgeberbestaetigung
```

Vertraege und Vorlagen:

```text
GET  /api/contracts
POST /api/contracts
GET  /api/contracts/:id
DELETE /api/contracts/:id
GET  /api/contracts/:id/download
GET  /api/contracts/:id/preview
GET  /api/contracts/:id/thumbnail

GET  /api/templates
POST /api/templates
GET  /api/templates/:id
PATCH /api/templates/:id
DELETE /api/templates/:id
GET  /api/templates/:id/download
GET  /api/templates/:id/preview
GET  /api/templates/:id/thumbnail
```

Aktivitaeten:

```text
GET /api/audit-logs
```

## Backup-Format

Das Backup ist JSON und absichtlich lesbar:

```json
{
  "format": "immobilienportal.backup.v1",
  "exportedAt": "2026-05-24T06:33:22.856Z",
  "app": "Immobilienportal",
  "includeFiles": true,
  "summary": {
    "records": 0,
    "referencedFiles": 0,
    "includedFiles": 0,
    "missingFiles": 0
  },
  "tables": {
    "users": [],
    "properties": [],
    "units": [],
    "documentCategories": [],
    "documents": [],
    "accessPermissions": [],
    "brokerRequests": [],
    "brokerValuations": [],
    "tenantProfiles": [],
    "contractTemplates": [],
    "leaseContracts": [],
    "auditLogs": [],
    "portalInstances": []
  },
  "files": [
    {
      "path": "/app/uploads/beispiel.pdf",
      "sha256": "...",
      "base64": "..."
    }
  ],
  "missingFiles": []
}
```

Beim Bearbeiten per Texteditor sollten IDs erhalten bleiben, damit Beziehungen zwischen Tabellen weiter stimmen.
