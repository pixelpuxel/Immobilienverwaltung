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

- Eigentümer (technische Rolle `ADMIN`)
- Makler
- Mieter

## Kernfunktionen

- Admin-Dashboard
- Dashboard zeigt neben Anzahl Immobilien/Einheiten/Dokumente/Verträge auch gesamten Immobilienwert und Mieteinnahmen pro Monat/Jahr.
- Audit-Log auf der Startseite heißt sichtbar "Letzte Aktivitäten" und nutzt verständliche deutsche Bezeichnungen mit farbigen, passenden Aktivitätsicons.
- Dashboard darf hochwertige leichte Hintergrundverläufe und dezente visuelle Akzente verwenden, ohne Ladezeit oder Lesbarkeit zu verschlechtern.
- Sichtbares Wording soll "Eigentümer" statt "Admin" verwenden, auch wenn die technische Rolle intern `ADMIN` bleibt.
- Eigentümerprofil mit Kontaktperson, Anschrift, Telefon, Kontakt-E-Mail, Bank, IBAN, Steuer-ID und Notizen für Verkauf/Mietvertrag.
- Immobilien und Einheiten verwalten
- Immobilien haben neben einer freien lesbaren Adresse strukturierte Adressfelder: Straße, Hausnummer, PLZ, Ort und Land. Die freie Adresse darf weiter existieren, aber Formulare, Verträge und Wohnungsgeberbestätigungen sollen bevorzugt die strukturierten Felder nutzen.
- Immobilien können Koordinaten `latitude` und `longitude` enthalten. Eine eigene Kartenseite zeigt alle Immobilien mit Koordinaten auf OpenStreetMap mit klickbaren Pins, die zur Detailansicht führen. Eigentümer sehen alle Objekte der Instanz, Makler nur freigegebene Objekte.
- Bestandsobjekte können beim Seed/Import anhand bekannter Freitextadressen mit strukturierten Adressdaten und Koordinaten ergänzt werden, damit behördliche Formulare und Kartenansicht sofort nutzbar sind.
- Zu jeder Immobilie können mehrere Objektbilder hochgeladen werden. Bilder werden sicher im privaten Dateispeicher abgelegt, in der Objekt-Detailansicht als Galerie angezeigt und ein Bild kann als Hauptbild markiert werden. Das Hauptbild erscheint in Immobilienübersichten als großes Thumbnail.
- Dokumente hochladen, kategorisieren, freigeben und geschützte Downloads bereitstellen
- Thumbnail-Vorschau für Dokumente
- Admin-Dokumentenverwaltung gruppiert Unterlagen nach Immobilien/Objekten, inklusive Bereich für allgemeine Dokumente ohne Objektzuordnung
- Makler für mehrere Immobilien freischalten
- Mieter einer Einheit mit Mietzeitraum zuordnen
- Makler und Mieter werden in der Benutzerverwaltung angelegt/freigeschaltet, nicht als "Einladung" formuliert.
- Login und Benutzeranlage unterstützen Benutzername oder E-Mail. E-Mail darf fehlen, wenn ein Benutzername gesetzt ist.
- Leere optionale Datums- und Zahlenfelder dürfen die Benutzeranlage nicht blockieren.
- Pro Einheit mehrere historische Mieter erlauben, aber nur einen laufenden Mieter gleichzeitig
- Mieterbereich mit Stammdaten, bereitgestellten Dokumenten und Downloads
- Mietvertragsgenerator aus DOCX-Vorlagen oder Standardvertrag mit PDF-Ausgabe
- Standardvertrag unterstützt Wohnraum-/WG-Zimmerdaten, Mietgegenstand, Gemeinschaftsräume, Kaltmiete, Nebenkosten, Warmmiete, Kaution, Zahlungsziel, Vermieterbank, Staffelmiete und besondere Vereinbarungen
- Vertragsgenerator-Seite enthält eine kurze Admin-Anleitung: DOCX-Vorlagen bleiben normaler Vertragstext, variable Stellen werden mit `{{platzhalter}}` markiert und beim Generieren ersetzt.
- Vertragsgenerator-Listenlayout muss lange Mieter-/Objekt-/Vorlagennamen sauber umbrechen oder kürzen; Vorschau-, DOCX-, PDF- und Löschbuttons dürfen nicht überhöht oder schmal gequetscht werden.
- Vertragsvorlagen-Vorschau darf DOCX nicht herunterladen, sondern muss serverseitig eine PDF-Vorschau erzeugen und inline anzeigen.
- Seed legt eine Beispielvorlage "Mietvertrag Musterstraße WG-Zimmer Vorlage" an, die aus dem vorhandenen Max-Mustermann-Vertrag abgeleitet ist und die variablen Vertragsstellen durch Platzhalter ersetzt.
- Generierte Mietverträge haben aussagekräftige Dateinamen nach Objekt, Einheit, Mieter und Zeitpunkt.
- Vertragsgenerator zeigt Fortschritt beim Erzeugen, generierte Verträge mit Thumbnail, Vorschau, DOCX-/PDF-Download und Löschfunktion.
- Nach erfolgreicher Vertragsgenerierung wartet die Fortschrittsanzeige, bis die Vorschau abrufbar ist, und aktualisiert anschließend die Seite.
- Vertragsgenerator trennt erzeugte Verträge und Vertragsvorlagen in zwei Karteikarten-Tabs.
- Im Tab "Generierte Verträge" werden Verträge nach Immobilie und darunter nach Einheit gruppiert.
- Im Vertragsgenerator gibt es in der rechten Spalte neben Vorlagen-Upload und Vertragsgenerierung auch eine kompakte Maske "Mieter anlegen", damit neue Mieter direkt fuer die Vertragserstellung erfasst werden koennen. Die Maske darf minimal sein und weitere Miet-/Vertragsdaten einklappbar anbieten.
- Mieterbereich zeigt die für den Mieter erzeugten Mietverträge mit Thumbnail, Vorschau und PDF-Download.
- Admin kann Vertragsvorlagen sehen, per Vorschau prüfen, herunterladen, umbenennen, durch neue DOCX-Version ersetzen und löschen.
- Mietvertragsvorlagen können aus bestehenden DOCX-Verträgen abgeleitet werden. Für Beispielweg 7 existiert eine Vorlage, bei der personenbezogene und variable Vertragsdaten durch Portal-Platzhalter ersetzt sind.
- Wohnungsgeberbestätigung nach § 19 BMG für Region Musterstadt als PDF generieren und im Mieterbereich bereitstellen
- Wohnungsgeberbestätigung nur durch Admin erzeugen; Mieter dürfen sie nur herunterladen.
- Je Mieter darf nur eine Wohnungsgeberbestätigung existieren. Vor einer neuen Erstellung muss die alte Datei manuell gelöscht werden.
- Layout der Wohnungsgeberbestätigung am amtlichen Baden-Württemberg/§19-BMG-Formular ausrichten: Titel, Wohnungsdaten, Personenliste, Wohnungsgeber/Eigentümer, Checkbox Eigentümerstatus, Bestätigungstext, Ort/Datum/Unterschrift, §19-BMG-Hinweis und Datenschutzseite.
- Maklerbereich als Immobilienansicht mit freigegebenen Objekten, Objektdaten, Einheiten, aktuellen Mietern, Kontaktdaten, Verträgen und Verkaufsunterlagen
- Makler-Dashboard mit rollenbezogenen Zahlen und Links, ohne Audit-Log
- Kontaktmöglichkeit zum Eigentümer / zur Verwaltung und Anforderung fehlender Unterlagen
- Eigentümer kann echte Benutzeransichten öffnen und exakt sehen, was konkrete Makler oder Mieter sehen
- Eigentümer kann Dokumente in der Dokumentenverwaltung löschen und per Zuordnung auf andere Immobilien/Einheiten verschieben.
- Dokumentenverwaltung gruppiert Dokumente nach Objekt in klar erkennbare, kompakte Aufklappbereiche mit Pfeil, Hinweistext, Dokumentarten-Vorschau und Dokumentanzahl. Beim Aufklappen werden die Dokumente als kompakte Karten mit Thumbnail-Vorschau und normal proportionierten Aktionen angezeigt.
- Eigentümer kann Nicht-Eigentümer-Benutzer löschen; eigene und andere Eigentümer-Konten sind geschützt.
- Benutzerverwaltung zeigt Benutzernamen als hervorgehobenes Kürzel, ohne leere Platzhaltertexte, wenn kein Benutzername vorhanden ist.
- Dashboard zeigt Kaltmiete und Warmmiete separat mit Monats- und Jahreswerten sowie kurze Erklärtexte unter allen Kennzahlen.
- Tiefgarage/Garagenmiete wird als eigenes Feld an Einheit und Mieterprofil geführt. Sie ist ein separater Baustein, zählt aber in allen Rendite- und Kaltmiete-Berechnungen zur Kaltmiete. Warmmiete = Kaltmiete + Tiefgarage + Nebenkosten, sofern kein expliziter Warmmietwert hinterlegt ist.
- Dashboard zeigt Immobilienwert, valutierte Darlehen, Nettowert, Rendite und gehebelte Rendite. Rendite = Jahreskaltmiete / Kaufpreisvorstellung; gehebelte Rendite = Jahreskaltmiete / Nettowert.
- Desktop-Dashboard-Kacheln müssen stabile Breiten, kompakte Werte und keine hässlichen Wortumbrüche haben; große Werte zeigen nur den Wert, Einheiten wie "pro Monat" stehen in der Erklärung.
- Audit-Logs für Login, Upload, Download, Rechteänderung, Vertrag/Formularerstellung; im Dashboard als "Letzte Aktivitäten" mit verständlichen Labels, Kontext-Link und kurzer Detailbeschreibung. Kontextlinks sollen erkennbare Namen wie Objektname, Dokumenttitel, Mieter oder Einheit zeigen, keine rohen Datenbank-IDs. Aktion und Kontext sollen kompakt in einer Zeile stehen, z.B. "Immobilie geändert: Beispielweg 7".
- Menüpunkt `/audit` wird sichtbar als "Aktivitäten" formuliert, behält aber Zeitstempel, Benutzer und IP zur Nachvollziehbarkeit.
- Portal ist mandantenfähig: Die bestehende Nutzung bleibt eine eigene Instanz, weitere Nutzer/Kunden können als neue leere Portal-Instanz mit eigenem Eigentümerzugang angelegt werden.
- Plattform-Eigentümer können unter Einstellungen Portal-Instanzen sehen und neue Instanzen anlegen. Normale Eigentümer sehen nur ihre eigene Instanz.
- Die öffentliche Loginseite ist nicht nur ein nacktes Formular, sondern eine seriöse kleine Einstiegsseite: Navigation, Hero-Bereich mit Immobilienbild, Funktionsbeschreibung, Rollenübersicht, Sicherheits-/Betriebshinweise und sichtbarer Loginbereich. Sie soll erklären, was das Portal kann und was Benutzer nach dem Login erwartet.

## Aktuelle fachliche Regeln

- Maklerrechte hängen an Immobilien und können mehrere Immobilien umfassen.
- Interne Maklerzugriffe und Freigabelisten dürfen in Objektansichten nur Admins sehen, nicht Makler.
- Die Kaufpreisvorstellung des Eigentümers ist nur für Eigentümer/Admin sichtbar.
- Kaufpreisvorstellungen und Maklerschätzungen werden in Euro mit deutscher Formatierung angezeigt und beim Objekt prominent dargestellt.
- In der Immobilienübersicht sind Kaufpreisvorstellung und valutiertes Darlehen inline bearbeitbar und speichern automatisch, sobald das Feld den Fokus verliert.
- Makler können pro freigegebener Immobilie eine eigene Kaufpreisschätzung mit Notiz erfassen. Diese Schätzung ist je Makler separat und wird dem Eigentümer mit Maklerbezug angezeigt.
- Maklerzugriffe in der Objekt-Detailansicht müssen direkt zur Rechteverwaltung führen.
- Dokumentrechte hängen zusätzlich an Dokumentfreigaben.
- Immobilien, Benutzer, Dokumente, Vertragsvorlagen, generierte Verträge, Maklerzugriffe, Mieterprofile und Aktivitäten sind nach Portal-Instanz getrennt. API-Routen und Seiten müssen immer auf die aktuelle Instanz des eingeloggten Benutzers filtern.
- E-Mail-Adressen und Benutzernamen sind aktuell portalweit eindeutig; bei späterer Subdomain-/Instanz-Anmeldung kann das zu instanzbezogener Eindeutigkeit erweitert werden.
- Energieausweise sind nicht nur Textfelder, sondern als geschützte Dokumente direkt am Objekt hochladbar.
- Mieterrechte hängen an einer Einheit und an freigegebenen/eigenen Dokumenten.
- Mieter-Dashboard zeigt keine Immobilien-/Einheitenanzahl, sondern nur für Mieter relevante Dokumente und Verträge.
- Nebenkostenabrechnungen werden als Dokumente der Kategorie "Nebenkostenabrechnungen" gespeichert, im Mieterbereich aber in einem eigenen Bereich angezeigt. Admins können je Einheit direkt aus der Objektansicht zur passend vorbefüllten Uploadmaske springen.
- Mieter können minimal angelegt werden: Benutzername oder Vorname oder Nachname reicht; weitere Daten dürfen später ergänzt werden. Fehlermeldungen beim Speichern müssen konkrete Feldhinweise enthalten.
- Einheiten enthalten Kaltmiete, Nebenkosten und Warmmiete.
- Einheiten und Mieterprofile enthalten zusätzlich Tiefgarage/Garagenmiete.
- Tiefgarage/Garagenmiete soll in der Oberfläche nicht als reines Freitextfeld erscheinen, sondern über sinnvolle Standardwerte auswählbar sein. Individuelle Beträge bleiben möglich, wo Vertragsdaten manuell ergänzt werden.
- Einheiten können als WG / Mehrfachvermietung markiert werden. Dann dürfen mehrere laufende Mieterprofile gleichzeitig derselben Einheit zugeordnet sein; ohne WG-Kennzeichen beendet ein neuer laufender Mieter die bisherigen laufenden Mieter derselben Einheit.
- Ein Mieterprofil enthält Einzug, Auszug, ein Kennzeichen `laufend`, Zahlungsziel, Vermieterbankverbindung, Mietgegenstand, Gemeinschaftsräume, Staffelmiete, Vertragsnotizen und besondere Vereinbarungen.
- Vertragsplatzhalter enthalten `{{garage_rent}}` für die Tiefgarage und `{{cold_rent_total}}` für Kaltmiete inklusive Tiefgarage.
- Wird ein Mieter für eine Einheit auf `laufend` gesetzt, werden andere laufende Mieter derselben Einheit beendet.
- Wohnungsgeberbestätigung muss mindestens Wohnungsgeber, Einzugsdatum, strukturierte Anschrift der Wohnung und meldepflichtige Personen enthalten.
- Wohnungsgeberbestätigung wird als einseitiges Formular erzeugt; Ort/Datum kommen aus den Eigentümer-/Objektdaten. Eigentümer können eine JPG-Unterschrift hinterlegen, die beim Generieren in das PDF gesetzt wird.
- Der Mietverlauf muss als Jahreskalender pro Einheit nutzbar sein: Mieter-Namen und belegte Tage sind klickbar und springen zur Benutzerverwaltung; vorhandene Vor-/Folgejahre sind über Pfeiltasten erreichbar.
- Dokumente können in der Dokumentenverwaltung nicht nur zugeordnet, sondern auch mit sinnvollem Vorschlag umbenannt werden. Dabei wird der geschützte Dateipfad im lokalen Speicher mit umbenannt.
- Die Benutzeransicht ist ein eigenständiger Umschalter oben in der Oberfläche; Instanzwechsel erfolgen ausschließlich über Einstellungen/Portal-Instanzen.
- API-Zugänge heißen in der Oberfläche API-Token. Technisch werden sie weiterhin als Bearer-Token im Authorization-Header gesendet.

## Docker / Betrieb

- App intern auf Port 8088
- `APP_HOST=0.0.0.0`
- `APP_PORT=8088`
- Portmapping: `${APP_PORT}:8088`
- kompatibel mit Nginx Proxy Manager, Traefik und Caddy
- `APP_URL` und `TRUST_PROXY` per ENV konfigurierbar
- persistente Volumes: `postgres_data`, `uploads_data`, `contracts_data`
- Daten liegen im Betrieb in PostgreSQL sowie in den Docker-Volumes/Containerpfaden `UPLOAD_PATH` und `CONTRACTS_PATH`.
- Einstellungen enthalten Backup/Import: ein einzelnes versioniertes JSON mit allen Tabellen, Dateien als Base64 und SHA-256-Prüfsummen. Import erfolgt mit einem Datei-Upload und stellt Datensätze und Dateien anhand stabiler IDs wieder her.
- Backup/Export läuft instanzbezogen und kann Dokumente, Vertragsvorlagen und generierte Verträge optional einbetten.

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

- `/login` als öffentliche Einstiegs- und Loginseite mit Produktbeschreibung, Rollen-, Funktions- und Sicherheitshinweisen
- `/dashboard`
- `/properties`
- `/properties/[id]`
- `/map` als OpenStreetMap-Kartenansicht mit klickbaren Immobilien-Pins, Mausrad-Zoom, Drag und Zwei-Finger-Zoom auf Mobilgeräten
- `/documents`
- `/users`
- `/broker` als Immobilienbereich für Makler
- `/tenant`
- `/contracts`
- `/settings`
- `/audit`

Diese Datei ist fortzuschreiben, sobald neue Features ergänzt oder bestehende Anforderungen korrigiert werden.
