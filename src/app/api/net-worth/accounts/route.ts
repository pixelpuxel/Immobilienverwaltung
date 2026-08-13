import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { loadBankingAccounts } from "@/lib/banking-integration";
import { serializeBankingAccount } from "@/lib/net-worth";

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  try {
    const accounts = await loadBankingAccounts(user.portalInstanceId);
    return NextResponse.json({ items: accounts.map(serializeBankingAccount) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Bankkonten konnten nicht geladen werden." }, { status: 502 });
  }
}
