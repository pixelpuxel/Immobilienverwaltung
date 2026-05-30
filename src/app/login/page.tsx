import { redirect } from "next/navigation";
import Image from "next/image";
import { currentUser } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";

const features = [
  {
    title: "Objekte und Einheiten",
    text: "Immobilien, Einheiten, Mieter, Kaufpreisvorstellungen, Darlehen und Renditen an einem Ort pflegen."
  },
  {
    title: "Unterlagen mit Rechten",
    text: "Dokumente strukturiert ablegen und gezielt fuer Eigentuemer, Makler oder Mieter freigeben."
  },
  {
    title: "Vertraege und Formulare",
    text: "Mietvertraege aus Vorlagen erzeugen und Wohnungsgeberbestaetigungen mit den aktuellen Daten bereitstellen."
  }
];

const roles = [
  { label: "Eigentuemer", text: "Volle Verwaltung, Auswertungen, Benutzerrechte und Aktivitaeten." },
  { label: "Makler", text: "Freigegebene Verkaufsunterlagen, Objekt- und aktuelle Mieterdaten." },
  { label: "Mieter", text: "Eigene Dokumente, Mietvertrag und persoenliche Stammdaten." }
];

export default async function LoginPage() {
  const user = await currentUser();
  if (user) redirect("/dashboard");
  return (
    <main className="min-h-screen bg-[#f4f8f5] text-ink">
      <header className="border-b border-white/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4">
          <a className="text-xl font-black tracking-normal" href="#start">Immobilienportal</a>
          <nav className="flex flex-wrap items-center gap-2 text-sm font-semibold text-muted">
            <a className="rounded-md px-3 py-2 hover:bg-panel hover:text-ink" href="#funktionen">Funktionen</a>
            <a className="rounded-md px-3 py-2 hover:bg-panel hover:text-ink" href="#rollen">Rollen</a>
            <a className="rounded-md px-3 py-2 hover:bg-panel hover:text-ink" href="#sicherheit">Sicherheit</a>
            <a className="button px-4 py-2" href="#login">Einloggen</a>
          </nav>
        </div>
      </header>

      <section id="start" className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-8 lg:py-12 xl:grid-cols-[minmax(0,1.08fr)_420px]">
        <div className="grid content-start gap-6">
          <div className="overflow-hidden rounded-lg border border-line bg-white shadow-sm">
            <div className="relative min-h-[420px]">
              <Image
                alt="Moderne Wohnimmobilie als Portal-Motiv"
                className="object-cover"
                fill
                priority
                sizes="(min-width: 1024px) 760px, 100vw"
                src="/portal-login-real-estate.png"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-ink/85 via-ink/45 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8">
                <div className="max-w-2xl text-white">
                  <p className="text-sm font-black uppercase tracking-normal text-emerald-100">Selbst gehostete Immobilienverwaltung</p>
                  <h1 className="mt-3 text-4xl font-black leading-tight tracking-normal sm:text-5xl">Immobilien, Unterlagen und Zugriffe professionell organisieren.</h1>
                  <p className="mt-4 max-w-xl text-base leading-7 text-white/85">
                    Das Portal buendelt Objektverwaltung, Dokumentenfreigaben, Maklerzugriffe, Mieterbereiche und Vertragsgenerierung in einer lokal betreibbaren Anwendung.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div id="funktionen" className="grid gap-3 md:grid-cols-3">
            {features.map((feature) => (
              <section key={feature.title} className="rounded-lg border border-line bg-white p-4 shadow-sm">
                <div className="mb-3 h-1.5 w-12 rounded-full bg-gradient-to-r from-accent to-sky-400" />
                <h2 className="text-lg font-bold">{feature.title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted">{feature.text}</p>
              </section>
            ))}
          </div>
        </div>

        <aside id="login" className="grid content-start gap-4 xl:sticky xl:top-6">
          <section className="rounded-lg border border-line bg-white p-5 shadow-sm">
            <p className="text-sm font-black uppercase tracking-normal text-accent">Portalzugang</p>
            <h2 className="mt-2 text-2xl font-black">Einloggen</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Melde dich mit Benutzername oder E-Mail an. Danach siehst du nur die Bereiche und Dokumente, die fuer deine Rolle freigeschaltet sind.
            </p>
            <div className="mt-5">
              <LoginForm />
            </div>
          </section>

          <section id="sicherheit" className="rounded-lg border border-line bg-[linear-gradient(135deg,#ffffff,#eef8f4)] p-5 shadow-sm">
            <h2 className="text-lg font-bold">Betrieb und Sicherheit</h2>
            <div className="mt-4 grid gap-3 text-sm text-muted">
              <div className="rounded-md bg-white/80 p-3">Dockerisiert, reverse-proxy-tauglich und fuer eigene Server vorbereitet.</div>
              <div className="rounded-md bg-white/80 p-3">Geschuetzte Downloads, rollenbasierte Rechte und nachvollziehbare Aktivitaeten.</div>
              <div className="rounded-md bg-white/80 p-3">Datenbank und Dateien bleiben in deiner eigenen Infrastruktur.</div>
            </div>
          </section>
        </aside>
      </section>

      <section id="rollen" className="mx-auto w-full max-w-7xl px-5 pb-10">
        <div className="rounded-lg border border-line bg-white p-5 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
            <div>
              <p className="text-sm font-black uppercase tracking-normal text-accent">Rollenbasierte Ansichten</p>
              <h2 className="mt-2 text-2xl font-black">Jeder sieht genau seinen Arbeitsbereich.</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {roles.map((role) => (
                <div key={role.label} className="rounded-md bg-panel p-4">
                  <div className="grid h-10 w-10 place-items-center rounded-md bg-gradient-to-br from-accent to-sky-500 text-sm font-black text-white">
                    {role.label.slice(0, 1)}
                  </div>
                  <h3 className="mt-3 font-bold">{role.label}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{role.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
