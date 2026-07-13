export const metadata = {
  title: "Datenschutz | Immobilienportal",
  description: "Datenschutzhinweise fuer die Immobilienportal-App"
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-slate-900">
      <h1 className="text-3xl font-semibold tracking-tight">Datenschutzhinweise</h1>
      <p className="mt-4 text-slate-700">
        Diese Seite beschreibt die Datenverarbeitung fuer die mobile Immobilienportal-App.
        Die App ist eine kostenlose Begleit-App fuer Nutzer eines bestehenden, selbst
        gehosteten Immobilienverwaltungsportals.
      </p>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">Verantwortlicher</h2>
        <p>
          Gabriel Schreiber
          <br />
          Zur Hohenmarkt 19
          <br />
          78343 Gaienhofen
          <br />
          E-Mail: <a className="text-teal-700 underline" href="mailto:apps@post.schreiber.info">apps@post.schreiber.info</a>
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">Welche Daten verarbeitet werden</h2>
        <p>
          Die App zeigt Daten an, die im verbundenen Portal bereits vorhanden sind, zum
          Beispiel Immobilien, Einheiten, Mieter, Dokumente, Vertrage, Aufgaben und
          Kontaktdaten. Fuer den Zugriff wird ein API-Token des jeweiligen Portals
          verwendet.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">Lokale Speicherung</h2>
        <p>
          Zur Offline-Nutzung speichert die App abgerufene Portal-Daten lokal auf dem
          Geraet. Diese Daten dienen der schnellen Anzeige und werden bei bestehender
          Verbindung mit dem Portal aktualisiert.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">Keine In-App-Kaeufe</h2>
        <p>
          Die App enthaelt keine In-App-Kaeufe und verkauft keine digitalen oder
          physischen Inhalte. Ein Zugriff ist nur fuer eingeladene Portalnutzer mit
          gueltigem Zugang vorgesehen.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">Kontakt</h2>
        <p>
          Fragen zum Datenschutz koennen per E-Mail an{" "}
          <a className="text-teal-700 underline" href="mailto:apps@post.schreiber.info">apps@post.schreiber.info</a>{" "}
          gerichtet werden.
        </p>
      </section>
    </main>
  );
}
