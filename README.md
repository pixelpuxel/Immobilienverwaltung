# Immobilienportal

Selbst gehostetes Immobilienportal fuer Verwaltung, Verkaufsunterlagen, Maklerzugriffe, Mieterbereiche und Mietvertragsgenerierung.

Die Anwendung ist als Docker-Compose-Stack gebaut und startet mit genau:

```bash
docker compose up -d --build
```

## Tech-Stack

- Next.js App Router mit TypeScript
- PostgreSQL
- Prisma ORM
- Tailwind CSS
- sichere signierte Cookie-Sessions
- bcrypt Passwort-Hashing
- lokaler Dateispeicher ueber Docker Volumes
- docxtemplater fuer DOCX-Vorlagen
- LibreOffice Headless fuer PDF-Erzeugung aus DOCX
- Redis optional vorbereitet

## Installation

1. Repository klonen oder Projektordner auf den Server kopieren.

2. In den Projektordner wechseln:

```bash
cd immobilienverwaltung
```

3. ENV-Datei anlegen:

```bash
cp .env.example .env
```

4. `.env` anpassen. Wichtig sind mindestens:

```env
APP_URL=https://portal.meinedomain.de
TRUST_PROXY=true
APP_HOST=0.0.0.0
APP_PORT=8088
ADMIN_EMAIL=admin@meinedomain.de
ADMIN_PASSWORD=ein_sicheres_passwort
JWT_SECRET=ein_langer_zufaelliger_wert
NEXTAUTH_SECRET=ein_langer_zufaelliger_wert
```

5. Anwendung starten:

```bash
docker compose up -d --build
```

6. Im Browser oeffnen:

```text
http://localhost:8088
```

Oder hinter Reverse Proxy:

```text
https://portal.meinedomain.de
```

7. Standard-Eigentümer einloggen:

```text
E-Mail: Wert aus ADMIN_EMAIL
Passwort: Wert aus ADMIN_PASSWORD
```

Beim Containerstart werden Datenbanktabellen synchronisiert, Dokumentkategorien angelegt und der Eigentümer aus ENV erzeugt oder aktualisiert.

## Docker

Services:

- `app`: Next.js-Anwendung, intern Port `8088`
- `postgres`: PostgreSQL 16
- `deploy-hook`: lokaler Deploy-Webhook, intern Port `8099`
- `redis`: optionales Profil `redis`

Persistente Volumes:

- `postgres_data`
- `uploads_data`
- `contracts_data`

Port-Mapping:

```yaml
ports:
  - "${APP_PORT}:8088"
```

## Lokaler Deploy-Webhook

Der Stack enthaelt einen lokalen Webhook, mit dem ein Rebuild der App per URL gestartet werden kann.

Wichtig:

- Nur im lokalen Netzwerk nutzen.
- Nicht ueber Reverse Proxy ins Internet veroeffentlichen.
- `DEPLOY_TOKEN` in `.env` lang und geheim halten.
- Der Hook hat Zugriff auf `/var/run/docker.sock` und darf dadurch Docker-Befehle auf dem NAS ausfuehren.

ENV:

```env
DEPLOY_PORT=8099
DEPLOY_TOKEN=sehr_langer_geheimer_token
```

Deploy starten:

```text
http://NAS-IP:8099/deploy?token=DEPLOY_TOKEN
```

Status pruefen:

```text
http://NAS-IP:8099/status?token=DEPLOY_TOKEN
```

Der Hook fuehrt standardmaessig aus:

```bash
docker compose -p immobilienverwaltung up -d --build app
```

## Reverse Proxy

Kompatibel mit Nginx Proxy Manager, Traefik und Caddy.

Empfohlene ENV-Werte:

```env
APP_URL=https://portal.meinedomain.de
TRUST_PROXY=true
APP_HOST=0.0.0.0
APP_PORT=8088
```

Der Reverse Proxy leitet auf:

```text
http://app:8088
```

oder bei externem Mapping:

```text
http://SERVER-IP:8088
```

## Sicherheit

- Passwoerter werden mit bcrypt gehasht.
- Sessions sind HTTP-only, signiert, SameSite=Lax und bei HTTPS `secure`.
- Rollen: Eigentümer, Makler, Mieter.
- Datei-Downloads laufen ueber geschuetzte Backend-Routen.
- Uploads liegen nicht in oeffentlichen Webpfaden.
- Dokumente ohne hochgeladene Datei zeigen keinen Download-Link.
- Dateitypen und Dateigroesse werden serverseitig validiert.
- Mutierende API-Routen pruefen Same-Origin gegen CSRF.
- Sichere HTTP Header sind in Next.js konfiguriert.
- Audit-Logs protokollieren Login, Upload, Download, Rechteaenderung und Vertragsgenerierung.
- `.env` und lokale Daten sind per `.gitignore` ausgeschlossen.
- Rate Limiting ist als In-Memory-MVP vorbereitet.

## Funktionen

Eigentümer:

- Dashboard
- Immobilien anlegen, bearbeiten und loeschen
- Einheiten per API verwalten
- Dokumente hochladen und kategorisieren
- Dokumentenstatus verwalten
- Makler anlegen und für Immobilien freischalten
- Mieter anlegen und Einheiten zuordnen
- eigenes Eigentümerprofil mit Kontakt-, Bank- und Vertragsdaten pflegen
- Rechte pro Dokument per API vergeben
- Vertragsvorlagen hochladen
- Mietvertraege als DOCX und PDF generieren
- Audit-Logs ansehen

Makler:

- Login per eingeladenem Konto
- Zugriff auf freigegebene Immobilien
- Zugriff auf freigegebene Dokumente
- Dokumente herunterladen, wenn erlaubt

Mieter:

- Login per eingeladenem Konto
- Zugriff auf eigenen Bereich
- Stammdaten und Mietvertragsdaten pflegen
- Dokumente hochladen
- generierte Mietvertraege herunterladen

## Vertragsvorlagen

DOCX-Vorlagen koennen diese Platzhalter enthalten:

```text
{{tenant_name}}
{{tenant_birthdate}}
{{property_address}}
{{unit_number}}
{{rent_amount}}
{{service_charges}}
{{deposit}}
{{lease_start_date}}
{{move_in_date}}
```

Die PDF-Datei wird aus der erzeugten DOCX-Datei mit LibreOffice Headless erstellt.

## API-Routen

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET|POST /api/properties`
- `GET|PATCH|DELETE /api/properties/:id`
- `GET|POST /api/units`
- `PATCH|DELETE /api/units/:id`
- `GET|POST /api/documents`
- `GET|POST /api/document-categories`
- `GET /api/documents/:id/download`
- `POST /api/permissions`
- `GET|POST /api/broker-requests`
- `GET|POST /api/tenants`
- `GET|POST /api/templates`
- `GET|POST /api/contracts`
- `GET /api/contracts/:id/download?format=docx|pdf`
- `GET /api/audit-logs`
- `GET|POST /api/portal-instances`

## Portal-Instanzen

Das Portal ist mandantenfaehig. Die beim ersten Start erzeugte Installation bleibt als eigene Instanz erhalten; ein Plattform-Eigentuemer kann unter `Einstellungen` weitere, leere Portal-Instanzen mit eigenem Eigentümerzugang anlegen. Immobilien, Benutzer, Dokumente, Vertragsvorlagen, generierte Vertraege und Aktivitaeten werden pro Instanz getrennt.

Hinweis: E-Mail-Adressen und Benutzernamen muessen aktuell portalweit eindeutig sein. Fuer Kunden mit gleicher E-Mail wird spaeter ein Instanz-Login oder eine eigene Domain/Subdomain pro Instanz empfohlen.

## Entwicklung

Ohne Docker benoetigt die App lokal Node.js und PostgreSQL.

```bash
npm install
npm run prisma:push
npm run seed
npm run dev
```

Tests:

```bash
npm test
```

## Produktionshinweise

- `ADMIN_PASSWORD`, `JWT_SECRET` und `NEXTAUTH_SECRET` sofort aendern.
- Regelmaessige Backups von `postgres_data`, `uploads_data` und `contracts_data` einrichten.
- HTTPS immer ueber Reverse Proxy bereitstellen.
- Fuer mehrere App-Instanzen Rate Limiting auf Redis umstellen.
- Vor produktivem Betrieb die Admin-Workflows fuer Bearbeiten/Loeschen und detaillierte Rechtevergabe fachlich erweitern.
