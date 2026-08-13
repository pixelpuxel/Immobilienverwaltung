import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { syncNetWorthFromBanking } from "@/lib/net-worth-sync";

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz: ungueltiger Ursprung." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  try {
    return NextResponse.json(await syncNetWorthFromBanking(user));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Vermoegenswerte konnten nicht synchronisiert werden." }, { status: 502 });
  }
}
