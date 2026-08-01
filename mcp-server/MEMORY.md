# MCP Server Memory

## Projektentscheidungen

- Der MCP-Server ist ein eigener Docker-Container `immobilienportal_mcp`.
- Der Server ist bewusst vom Next.js-Portal getrennt.
- Er nutzt ausschliesslich die bestehende Integrations-API unter `/api/integrations/v1`.
- Kein direkter Zugriff auf PostgreSQL, Qdrant, Uploads oder Vertragsdateien.
- Der MCP-Server akzeptiert normale Portal-API-Tokens im Authorization-Header.
- Derselbe Portal-API-Token wird fuer die interne Integrations-API verwendet.
- Tokens werden im Portal unter Einstellungen -> API-Zugaenge administriert, nicht in `.env`.
- ChatGPT-OAuth wird vom Portal bereitgestellt. Der OAuth-Code-Flow erzeugt am Ende ebenfalls normale Portal-API-Tokens.
- Der MCP-Server sendet bei fehlendem/ungueltigem Token eine `WWW-Authenticate`-Challenge mit Protected-Resource-Metadata.
- Der Container bindet standardmaessig nur an `127.0.0.1`, damit die Veroeffentlichung bewusst ueber Reverse Proxy erfolgt.

## Aktueller Funktionsumfang

- Healthcheck und Benutzer-/Scope-Pruefung.
- Portalweite Suche.
- Portal-Agent-Fragen und Konversationskontext.
- Immobilien lesen/anlegen/aendern.
- Einheiten lesen/anlegen/aendern/loeschen.
- Mieter lesen/anlegen/aendern.
- Mieterdokumente lesen.
- Wohnungsgeberbestaetigung erzeugen.
- Dokumente lesen/aendern/loeschen und Links erzeugen.
- Dokumente mit `download_document` direkt als eingebettete MCP-Datei/Resource zurueckgeben, ohne signierte URL und ohne direkte Storage-Zugriffe.
- Dokumentkategorien lesen.
- Angehaengte Dateien direkt als MCP-Dateiobjekt oder als Base64-Rueckfall hochladen.
- Dateien koennen zuerst neutral in den Dokumenteneingang geladen und danach mit `classify_document` fachlich einsortiert werden.
- Mieterdokumente gezielt mit Kategorie-Name hochladen, z. B. Kuendigungen.
- Vertragsvorlagen lesen und ableiten.
- Mietvertraege erzeugen, suchen, loeschen und Links erzeugen.
- Mieteinnahmen lesen und Zahlungen setzen/korrigieren.
- Timeline-Ereignisse zu Immobilien, Einheiten und Mietern lesen/anlegen/aendern/loeschen.
- Timeline kombiniert manuelle Vorgangsereignisse mit automatisch abgeleiteten Ereignissen wie Einzug, Auszug, Kaution, Mietzahlung und Vertragsanlage.
- To-dos lesen.
- Audit-Logs lesen.
- Benutzer lesen/aendern.
- Portalinstanzen lesen/wechseln.
- Kontrollierter Fallback auf neue Integrations-Endpunkte.

## Noch bewusst offen

- Echte Chat-Anhaenge werden ueber `file` unterstuetzt, soweit der jeweilige MCP-Client Dateiobjekte an Tools uebergibt. `fileBase64` bleibt als Rueckfall bestehen.
- Separate GitHub-Repository-Auslagerung ist vorbereitet, aber noch nicht vollzogen.
- Tool-Audit im MCP-Server selbst ist minimal; Audit erfolgt primaer im Portal.

## Naechste sinnvolle Erweiterungen

- OpenAPI- oder Tool-Manifest automatisch aus `/api/integrations/v1` generieren.
- MCP-Ressourcen fuer `portal://properties`, `portal://documents`, `portal://contracts`.
- MCP-Prompts fuer Standardprozesse im SDK registrieren.
- End-to-End-Test mit einem echten ChatGPT-MCP-Connector gegen `https://portal.schreiber.info/mcp`.
