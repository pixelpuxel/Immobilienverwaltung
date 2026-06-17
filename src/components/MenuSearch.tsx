"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";

export function MenuSearch({ onSearch }: { onSearch?: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    onSearch?.();
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <form className="grid gap-2 rounded-md border border-line bg-white p-3" onSubmit={submit}>
      <label className="text-xs font-bold uppercase text-muted" htmlFor="menu-search">Suche</label>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <input id="menu-search" className="min-h-10 text-sm" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Suchen ..." />
        <button className="px-3 py-2 text-sm" type="submit">Los</button>
      </div>
    </form>
  );
}
