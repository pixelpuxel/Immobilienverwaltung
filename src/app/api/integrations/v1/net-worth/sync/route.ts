import { NextRequest, NextResponse } from "next/server";
import { requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { syncNetWorthFromBanking } from "@/lib/net-worth-sync";

export async function POST(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["write:settings"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;
  try {
    return NextResponse.json(await syncNetWorthFromBanking(user));
  } catch (error) {
    return NextResponse.json({ error: { code: "BANKING_FAILED", message: error instanceof Error ? error.message : "Vermoegenswerte konnten nicht synchronisiert werden." } }, { status: 502 });
  }
}
