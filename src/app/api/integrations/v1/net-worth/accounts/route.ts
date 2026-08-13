import { NextRequest, NextResponse } from "next/server";
import { requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { loadBankingAccounts } from "@/lib/banking-integration";
import { serializeBankingAccount } from "@/lib/net-worth";

export async function GET(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["read:properties"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;
  try {
    return NextResponse.json({ items: (await loadBankingAccounts(user.portalInstanceId)).map(serializeBankingAccount) });
  } catch (error) {
    return NextResponse.json({ error: { code: "BANKING_FAILED", message: error instanceof Error ? error.message : "Bankkonten konnten nicht geladen werden." } }, { status: 502 });
  }
}
