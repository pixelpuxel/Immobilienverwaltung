"use client";

import Link from "next/link";
import type { KeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type Suggestion = {
  type: "Immobilie" | "Einheit" | "Dokument" | "Mieter" | "Benutzer" | "Vertrag";
  title: string;
  description: string;
  href: string;
  badge?: string;
};

const typeTones: Record<Suggestion["type"], string> = {
  Immobilie: "bg-emerald-50 text-emerald-800 border-emerald-200",
  Einheit: "bg-blue-50 text-blue-800 border-blue-200",
  Dokument: "bg-violet-50 text-violet-800 border-violet-200",
  Mieter: "bg-amber-50 text-amber-900 border-amber-200",
  Benutzer: "bg-slate-100 text-slate-800 border-slate-200",
  Vertrag: "bg-rose-50 text-rose-800 border-rose-200"
};

const typeIcons: Record<Suggestion["type"], string> = {
  Immobilie: "IM",
  Einheit: "WE",
  Dokument: "DU",
  Mieter: "MI",
  Benutzer: "BE",
  Vertrag: "MV"
};

export function SearchAutocomplete({ defaultQuery = "" }: { defaultQuery?: string }) {
  const [query, setQuery] = useState(defaultQuery);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLFormElement>(null);
  const trimmedQuery = query.trim();

  useEffect(() => {
    setActiveIndex(-1);
    if (trimmedQuery.length < 2) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/search/suggestions?q=${encodeURIComponent(trimmedQuery)}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" }
        });
        if (!response.ok) throw new Error("suggestions failed");
        const body = (await response.json()) as { results?: Suggestion[] };
        setSuggestions(body.results || []);
        setOpen(true);
      } catch (error) {
        if (!controller.signal.aborted) {
          setSuggestions([]);
          setOpen(false);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [trimmedQuery]);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  const activeSuggestion = useMemo(() => suggestions[activeIndex], [activeIndex, suggestions]);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, suggestions.length - 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, -1));
    }
    if (event.key === "Escape") setOpen(false);
    if (event.key === "Enter" && activeSuggestion) {
      event.preventDefault();
      window.location.href = activeSuggestion.href;
    }
  }

  return (
    <form ref={wrapperRef} className="relative z-30 mt-5 grid gap-3" action="/search" autoComplete="off">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <div className="relative min-w-0">
          <label className="sr-only" htmlFor="global-search">Suchbegriff</label>
          <input
            id="global-search"
            name="q"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => {
              if (suggestions.length || trimmedQuery.length >= 2) setOpen(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Name, Adresse, Dokument, Mieter, Vertrag ..."
            autoFocus
            className="min-h-12 w-full pr-28 text-base"
            role="combobox"
            aria-expanded={open}
            aria-controls="global-search-suggestions"
            aria-autocomplete="list"
          />
          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted">
            {loading ? "Sucht ..." : trimmedQuery.length >= 2 ? `${suggestions.length} Treffer` : "ab 2 Zeichen"}
          </div>
        </div>
        <button className="min-h-12 px-6" type="submit">Suchen</button>
      </div>

      {open && trimmedQuery.length >= 2 ? (
        <div
          id="global-search-suggestions"
          className="overflow-hidden rounded-lg border border-line bg-white shadow-xl"
          role="listbox"
        >
          {suggestions.length > 0 ? (
            <div className="max-h-[min(28rem,60vh)] overflow-auto py-2">
              {suggestions.map((suggestion, index) => (
                <Link
                  key={`${suggestion.type}-${suggestion.href}-${suggestion.title}-${index}`}
                  href={suggestion.href}
                  className={`grid grid-cols-[2.75rem_1fr] gap-3 px-4 py-3 transition hover:bg-panel ${index === activeIndex ? "bg-panel" : ""}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <span className={`flex h-10 w-10 items-center justify-center rounded-lg border text-xs font-black ${typeTones[suggestion.type]}`}>
                    {typeIcons[suggestion.type]}
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-bold">{highlight(suggestion.title, trimmedQuery)}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${typeTones[suggestion.type]}`}>{suggestion.type}</span>
                    </span>
                    <span className="mt-1 block truncate text-sm text-muted">{suggestion.description || "Kein weiterer Kontext hinterlegt."}</span>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="px-4 py-4 text-sm text-muted">
              {loading ? "Suche laeuft ..." : "Keine direkten Vorschlaege gefunden. Mit Enter trotzdem suchen."}
            </div>
          )}
          <div className="border-t border-line bg-panel px-4 py-2 text-xs text-muted">
            Enter sucht alle Treffer. Pfeiltasten waehlen einen Vorschlag.
          </div>
        </div>
      ) : null}
    </form>
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
