# Immobilienportal Aufbau-Prompt

Baue ein selbst gehostetes Immobilienportal als Docker-Anwendung.

## Ziel

Ein webbasiertes Portal zur Verwaltung von Immobilien, Einheiten, Verkaufsunterlagen, Maklerzugriffen, Mieterbereichen, Mietverträgen und behördlichen Mieterformularen. Die Anwendung muss lokal per Docker betreibbar und später hinter einem Reverse Proxy hostbar sein.

## Start

Die gesamte Anwendung muss mit genau diesem Befehl startbar sein:

```bash
docker compose up -d --build
```

## Tech-Stack

- Next.js App Router
- TypeScript
- PostgreSQL
- Prisma ORM
- Tailwind CSS
- sichere Session-basierte Authentifizierung mit signiertem HttpOnly-Cookie
- Docker Compose
- lokaler Dateispeicher über Docker Volumes
- docxtemplater für DOCX-Verträge
- LibreOffice Headless für PDF-Generierung aus DOCX
- Poppler für PDF-Thumbnails
- optional Redis vorbereiten

## Rollen

- Admin / Eigentümer
- Makler
- Mieter

## Kernfunktionen

- Admin-Dashboard
- Immobilien und Einheiten verwalten
- Dokumente hochladen, kategorisieren, freigeben und geschützte Downloads bereitstellen
- Thumbnail-Vorschau für Dokumente
- Admin-Dokumentenverwaltung gruppiert Unterlagen nach Immobilien/Objekten, inklusive Bereich für allgemeine Dokumente ohne Objektzuordnung
- Makler für mehrere Immobilien freischalten
- Mieter einer Einheit mit Mietzeitraum zuordnen
- Pro Einheit mehrere historische Mieter erlauben, aber nur einen laufenden Mieter gleichzeitig
- Mieterbereich mit Stammdaten, bereitgestellten Dokumenten und Downloads
- Mietvertragsgenerator aus DOCX-Vorlagen oder Standardvertrag mit PDF-Ausgabe
- Standardvertrag unterstützt Wohnraum-/WG-Zimmerdaten, Mietgegenstand, Gemeinschaftsräume, Kaltmiete, Nebenkosten, Warmmiete, Kaution, Zahlungsziel, Vermieterbank, Staffelmiete und besondere Vereinbarungen
- Generierte Mietverträge haben aussagekräftige Dateinamen nach Objekt, Einheit, Mieter und Zeitpunkt.
- Vertragsgenerator zeigt Fortschritt beim Erzeugen, generierte Verträge mit Thumbnail, Vorschau, DOCX-/PDF-Download und Löschfunktion.
- Mieterbereich zeigt die für den Mieter erzeugten Mietverträge mit Thumbnail, Vorschau und PDF-Download.
- Admin kann Vertragsvorlagen sehen, per Vorschau prüfen, herunterladen, umbenennen, durch neue DOCX-Version ersetzen und löschen.
- Wohnungsgeberbestätigung nach § 19 BMG für Region Konstanz als PDF generieren und im Mieterbereich bereitstellen
- Wohnungsgeberbestätigung nur durch Admin erzeugen; Mieter dürfen sie nur herunterladen.
- Je Mieter darf nur eine Wohnungsgeberbestätigung existieren. Vor einer neuen Erstellung muss die alte Datei manuell gelöscht werden.
- Layout der Wohnungsgeberbestätigung am amtlichen Baden-Württemberg/§19-BMG-Formular ausrichten: Titel, Wohnungsdaten, Personenliste, Wohnungsgeber/Eigentümer, Checkbox Eigentümerstatus, Bestätigungstext, Ort/Datum/Unterschrift, §19-BMG-Hinweis und Datenschutzseite.
- Maklerbereich als Immobilienansicht mit freigegebenen Objekten, Objektdaten, Einheiten, aktuellen Mietern, Kontaktdaten, Verträgen und Verkaufsunterlagen
- Makler-Dashboard mit rollenbezogenen Zahlen und Links, ohne Audit-Log
- Kontaktmöglichkeit zum Eigentümer / zur Verwaltung und Anforderung fehlender Unterlagen
- Admin kann echte Benutzeransichten öffnen und exakt sehen, was konkrete Makler oder Mieter sehen
- Admin kann Dokumente in der Dokumentenverwaltung löschen und per Zuordnung auf andere Immobilien/Einheiten verschieben.
- Admin kann Nicht-Admin-Benutzer löschen; eigene und andere Admin-Konten sind geschützt.
- Audit-Logs für Login, Upload, Download, Rechteänderung, Vertrag/Formularerstellung

## Aktuelle fachliche Regeln

- Maklerrechte hängen an Immobilien und können mehrere Immobilien umfassen.
- Interne Maklerzugriffe und Freigabelisten dürfen in Objektansichten nur Admins sehen, nicht Makler.
- Dokumentrechte hängen zusätzlich an Dokumentfreigaben.
- Mieterrechte hängen an einer Einheit und an freigegebenen/eigenen Dokumenten.
- Einheiten enthalten Kaltmiete, Nebenkosten und Warmmiete.
- Ein Mieterprofil enthält Einzug, Auszug, ein Kennzeichen `laufend`, Zahlungsziel, Vermieterbankverbindung, Mietgegenstand, Gemeinschaftsräume, Staffelmiete, Vertragsnotizen und besondere Vereinbarungen.
- Wird ein Mieter für eine Einheit auf `laufend` gesetzt, werden andere laufende Mieter derselben Einheit beendet.
- Wohnungsgeberbestätigung muss mindestens Wohnungsgeber, Einzugsdatum, Anschrift der Wohnung und meldepflichtige Personen enthalten.

## Docker / Betrieb

- App intern auf Port 8088
- `APP_HOST=0.0.0.0`
- `APP_PORT=8088`
- Portmapping: `${APP_PORT}:8088`
- kompatibel mit Nginx Proxy Manager, Traefik und Caddy
- `APP_URL` und `TRUST_PROXY` per ENV konfigurierbar
- persistente Volumes: `postgres_data`, `uploads_data`, `contracts_data`

## Sicherheit

- Passwort-Hashing mit bcrypt oder Argon2
- HttpOnly Session Cookie
- CSRF-Prüfung über Same-Origin für schreibende Requests
- rollenbasierte Rechteprüfung auf API- und Seitenebene
- keine öffentlichen Uploadpfade
- Downloads nur über geschützte Backend-Routen
- sichere Header
- Rate Limiting für Login vorbereiten
- `.env` niemals committen

## Wichtige Seiten

- `/login`
- `/dashboard`
- `/properties`
- `/properties/[id]`
- `/documents`
- `/users`
- `/broker` als Immobilienbereich für Makler
- `/tenant`
- `/contracts`
- `/settings`
- `/audit`

Diese Datei ist fortzuschreiben, sobald neue Features ergänzt oder bestehende Anforderungen korrigiert werden.
