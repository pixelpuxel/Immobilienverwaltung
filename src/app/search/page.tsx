import Link from "next/link";
import { Role } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { SearchAutocomplete } from "@/components/SearchAutocomplete";
import { requireUser } from "@/lib/auth";
import { semanticDocumentSearch } from "@/lib/ai-search";
import { globalSearch, type SearchResult } from "@/lib/search";

export const dynamic = "force-dynamic";

const typeTones: Record<SearchResult["type"], string> = {
  Immobilie: "bg-emerald-50 text-emerald-800 border-emerald-200",
  Einheit: "bg-blue-50 text-blue-800 border-blue-200",
  Dokument: "bg-violet-50 text-violet-800 border-violet-200",
  Mieter: "bg-amber-50 text-amber-900 border-amber-200",
  Benutzer: "bg-slate-100 text-slate-800 border-slate-200",
  Vertrag: "bg-rose-50 text-rose-800 border-rose-200"
};

export default async function SearchPage({
  searchParams
}: {
  searchParams?: { q?: string };
}) {
  const user = await requireUser();
  const query = (searchParams?.q || "").trim();
  const [results, semanticResults] = query.length >= 2 ? await Promise.all([
    globalSearch(user, query),
    semanticDocumentSearch(user, query, 12).catch(() => [])
  ]) : [[], []];
  const grouped = groupResults(results);

  return (
    <AppShell role={user.role} userId={user.id} email={user.email} canSwitchView={user.role === Role.ADMIN || Boolean(user.impersonatedByAdminId)}>
      <div className="relative z-20 rounded-lg border border-line bg-[radial-gradient(circle_at_top_left,#e6f7ee_0,#ffffff_38%,#eef4ff_100%)] p-5 shadow-sm">
        <p className="text-sm font-bold uppercase tracking-wide text-accent">Portalweite Suche</p>
        <h1 className="mt-2 text-3xl font-bold">Suche</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Durchsucht Immobilien, Einheiten, Dokumente, Mieter, Vertraege und Benutzer strukturiert und semantisch, soweit sie fuer deine aktuelle Ansicht freigegeben sind.
        </p>
        <SearchAutocomplete defaultQuery={query} />
      </div>

      <section className="mt-6">
        {query.length === 0 ? <EmptyState title="Noch keine Suche gestartet" text="Gib mindestens zwei Zeichen ein, um alle freigegebenen Daten zu durchsuchen." /> : null}
        {query.length === 1 ? <EmptyState title="Suchbegriff ist zu kurz" text="Bitte mindestens zwei Zeichen eingeben." /> : null}
        {query.length >= 2 && results.length === 0 ? <EmptyState title="Keine Treffer" text={`Zu "${query}" wurden in deiner aktuellen Ansicht keine Daten gefunden.`} /> : null}

        <div className="grid gap-5">
          {semanticResults.length ? (
            <div className="overflow-hidden rounded-lg border border-line bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-[linear-gradient(135deg,#ecfdf5,#eef4ff)] px-4 py-3">
                <div>
                  <h2 className="text-xl font-bold">Semantische Dokumenttreffer</h2>
                  <p className="text-sm text-muted">{semanticResults.length} Treffer aus dem Dokumentindex</p>
                </div>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">Vektor</span>
              </div>
              <div className="divide-y divide-line">
                {semanticResults.map((result, index) => (
                  <Link key={`semantic-${result.href}-${index}`} href={result.href} className="block p-4 transition hover:bg-panel">
                    <div className="font-bold">{highlight(result.title, query)}</div>
                    <div className="mt-1 text-sm text-muted">{result.description || "Semantischer Treffer im Dokumentindex."}</div>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
          {grouped.map(([type, items]) => (
            <div key={type} className="overflow-hidden rounded-lg border border-line bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-panel px-4 py-3">
                <div>
                  <h2 className="text-xl font-bold">{type}</h2>
                  <p className="text-sm text-muted">{items.length} Treffer</p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-bold ${typeTones[type]}`}>{type}</span>
              </div>
              <div className="divide-y divide-line">
                {items.map((result, index) => (
                  <Link key={`${result.type}-${result.href}-${result.title}-${index}`} href={result.href} className="block p-4 transition hover:bg-panel">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="font-bold">{highlight(result.title, query)}</div>
                        <div className="mt-1 text-sm text-muted">{result.description || "Kein weiterer Kontext hinterlegt."}</div>
                      </div>
                      {result.badge ? <span className="inline-flex w-fit rounded-full bg-white px-3 py-1 text-xs font-semibold text-muted ring-1 ring-line">{result.badge}</span> : null}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

function groupResults(results: SearchResult[]) {
  const order: SearchResult["type"][] = ["Immobilie", "Einheit", "Dokument", "Mieter", "Benutzer", "Vertrag"];
  return order
    .map((type) => [type, results.filter((result) => result.type === type)] as const)
    .filter(([, items]) => items.length > 0);
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-panel p-6">
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="mt-2 text-sm text-muted">{text}</p>
    </div>
  );
}

function highlight(text: string, query: string) {
  const index = text.toLocaleLowerCase("de-DE").indexOf(query.toLocaleLowerCase("de-DE"));
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded bg-amber-100 px-1 text-inherit">{text.slice(index, index + query.length)}</mark>
      {text.slice(index + query.length)}
    </>
  );
}
