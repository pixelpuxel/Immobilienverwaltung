import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { globalSearch } from "@/lib/search";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await requireUser();
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim();
  if (query.length < 2) return NextResponse.json({ results: [] });
  const results = await globalSearch(user, query);
  return NextResponse.json({ results: results.slice(0, 10) });
}
