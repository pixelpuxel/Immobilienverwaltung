import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { indexAllDocuments } from "@/lib/ai-search";

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz: ungueltiger Ursprung." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const result = await indexAllDocuments(user.portalInstanceId);
  return NextResponse.json({ ok: true, ...result });
}
