import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationUser } from "@/lib/integration-auth";
import { globalSearch } from "@/lib/search";

export async function GET(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request);
  if (!user) return response;
  const q = request.nextUrl.searchParams.get("q") || "";
  const results = q.trim().length >= 2 ? await globalSearch(user, q) : [];
  return NextResponse.json({ items: results });
}

