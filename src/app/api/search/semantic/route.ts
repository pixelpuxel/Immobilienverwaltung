import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { semanticDocumentSearch } from "@/lib/ai-search";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const query = (request.nextUrl.searchParams.get("q") || "").trim();
  if (query.length < 2) return NextResponse.json({ results: [] });
  const results = await semanticDocumentSearch(user, query, 12);
  return NextResponse.json({ results });
}
