# Portal-Gedaechtnis

Diese Datei wird bei jeder fachlichen oder technischen Erweiterung des
Immobilienportals fortgeschrieben. Sie dokumentiert Entscheidungen,
produktive Datenmigrationen, API-Vertraege und Verifikation so, dass ein
anderer Agent den Stand nachvollziehen und weiterbauen kann. Geheimnisse,
Passwoerter und Tokenwerte gehoeren nicht in diese Datei.

## 29.07.2026 - Banking und Nebenkostenabrechnung

- Das Immobilienportal ist serverseitig mit `banking.schreiber.info`
  verbunden. Token werden verschluesselt gespeichert und niemals an den
  Browser ausgegeben.
- Immobilien, Einheiten und historische Mietverhaeltnisse werden als stabile
  externe IDs zwischen beiden Systemen synchronisiert.
- Die Arbeitsflaeche `/service-charges` laedt kontierte Ist-Kosten,
  tatsaechliche Nebenkostenvorauszahlungen, Abrechnungszahlungen und
  Kaltmietanteile aus Banking.
- Verteilermodelle: Flaeche und Belegungstage, feste Anteile und
  Belegungstage sowie externe Hausverwaltungsabrechnung.
- Tirolergasse 2025 wurde produktiv mit den drei WG-Zimmern
  `18,4 + 18,4 + 23,8 = 60,6 m2` gespeichert. Das Ladengeschaeft ist
  ausgeschlossen.
- Bei externer Hausverwaltung werden umlagefaehige Kosten, nicht
  umlagefaehige Kosten und Erhaltungsruecklage getrennt erfasst. Bankseitige
  Hausgeldzahlungen werden nicht als Mieter-Nebenkosten verteilt.
- Nebenkostenabrechnungen werden als unveraenderliche Snapshots mit
  fortlaufender Version, Status `DRAFT`/`FINAL`, SHA-256-Pruefsumme,
  Mieterergebnissen und geschuetztem PDF gespeichert.
- Entwuerfe koennen ausgeblendet werden. Festgeschriebene Versionen bleiben
  revisionsfest; geaenderte Eingangsdaten fuehren zu einer neuen Version.
- Die visuelle PDF-Pruefung deckte historische WG-Datensaetze mit zu spaetem
  gemeinsamem Auszugsdatum auf. Die Berechnung normalisiert deshalb je
  Einheit eine chronologische Zeitachse: Der naechste Einzug beendet den
  vorherigen Zeitraum. Das Auszugsdatum wird als letzter belegter Tag
  behandelt. Profile ohne Beginn werden ignoriert und gemeldet.
  Blockierende Hinweise verhindern das Festschreiben.
- Native Clients verwenden die Endpunkte unter
  `/api/integrations/v1/service-charge-statements`. Die iPhone-Handoff-Doku
  wird parallel im Repository `iPhone-Banking` aktualisiert.
- Abrechnungsversionen bieten ein Admin-Gesamt-PDF und einzelne Mieter-PDFs.
  Mieterzugriff wird serverseitig an das eigene Mietprofil gebunden; ein
  Gesamtbericht oder fremdes Mieter-PDF ist fuer diese Rolle gesperrt.
- Festgeschriebene Versionen werden automatisch im Mieterbereich des
  enthaltenen Mietprofils angezeigt; ein manueller PDF-Upload ist nicht
  erforderlich.
- Backup und Restore enthalten Verteilerschluessel, Einzelkosten und
  Abrechnungsversionen.
- Der Docker-Build fuehrt Prisma-Generierung, Vitest und Next-Build aus.
  Erst ein erfolgreicher Build wird auf dem NAS gestartet.
- Eine fruehere Dockerfile-Hilfe, die den kompletten `.next`-Routenbaum
  vorab erzeugte, verursachte reproduzierbare `mkdir`-Fehler in gecachten
  Docker-Layern. Sie wurde entfernt; Next erzeugt `.next` wieder selbst.
