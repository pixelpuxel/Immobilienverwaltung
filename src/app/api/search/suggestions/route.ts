import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { semanticDocumentSearch } from "@/lib/ai-search";
import { globalSearch } from "@/lib/search";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await requireUser();
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim();
  if (query.length < 2) return NextResponse.json({ results: [] });
  const [structured, semantic] = await Promise.all([
    globalSearch(user, query),
    semanticDocumentSearch(user, query, 5).catch(() => [])
  ]);
  const seen = new Set<string>();
  const results = [...semantic, ...structured].filter((result) => {
    const key = `${result.type}:${result.href}:${result.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return NextResponse.json({ results: results.slice(0, 10) });
}
