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

## 29.07.2026 - Produktiver VPS-Merge und Abrechnungsentwurf Tirol 2025

- Die oeffentliche Domain `portal.schreiber.info` zeigt auf den VPS
  `109.199.107.55`. Der VPS-Zweig mit sechs MCP/OAuth-Commits und der lokale
  Nebenkosten-Zweig hatten den gemeinsamen Stand `6acdc2c`. Beide Historien
  wurden ohne Konflikte in Merge-Commit `b5d30e5` vereinigt, nach GitHub
  gepusht und auf dem VPS gebaut.
- Der autoritative Docker-Build bestand 18/18 Vitest-Tests, Typecheck,
  Next.js-Produktionsbuild und Routengenerierung. Die neuen Web- und
  Integrationsrouten fuer Abrechnungsversionen sind an der oeffentlichen
  Domain aktiv.
- In der VPS-Produktivdatenbank wurde fuer Tirolergasse 2025 die bestaetigte
  Flaechenregel gespeichert: WG 1 `18,4`, WG 2 `18,4`, Dachgeschoss `23,8`,
  zusammen `60,6 m2`; das autarke Ladengeschaeft hat Anteil `0`.
- Das Portal verwendet einen dedizierten, unbegrenzten Banking-Lesetoken.
  Der Token wird serverseitig gespeichert und niemals ausgegeben.
- Abrechnungsentwurf Version 1 (`DRAFT`) wurde mit SHA-256-Pruefsumme
  `ab62230e3d533dfc6925ec9097aa6c38bdebb33075d78c91fb09dfef8712898b`
  erzeugt. Er enthaelt `6.239,75 EUR` umlagefaehige Kosten und
  `4.434,00 EUR` Vorauszahlungen.
- Visuelle PDF-Pruefung: eine A4-Seite, keine Ueberlaeufe, korrekte Umlaute,
  Zeitraeume und Summen. Der Entwurf bleibt bewusst unveroeffentlicht.
- Offener fachlicher Pruefpunkt: Jonas Dittmann ist fuer 92 Tage enthalten,
  aber in den vorhandenen Bankdaten existiert von Oktober bis Dezember 2025
  kein Zahlungseingang von ihm und kein plausibler alternativer
  574-EUR-Eingang. Deshalb weist der Entwurf `0 EUR` Vorauszahlung und
  `477,54 EUR` Nachzahlung aus. Vor `FINAL` muss dies fachlich bestaetigt
  oder durch weitere Bankdaten korrigiert werden.
