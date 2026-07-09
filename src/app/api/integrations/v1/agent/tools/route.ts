import { NextRequest, NextResponse } from "next/server";
import { agentToolCatalogForUi } from "@/lib/agent-tools";
import { requireIntegrationUser } from "@/lib/integration-auth";

export async function GET(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request);
  if (!user) return response;

  return NextResponse.json({
    items: agentToolCatalogForUi(user.role),
    nextCursor: null
  });
}
