import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationUser } from "@/lib/integration-auth";

export async function GET(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request);
  if (!user) return response;
  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      name: user.name,
      role: user.role,
      portalInstanceId: user.portalInstanceId
    },
    token: {
      id: user.tokenId,
      name: user.tokenName,
      scopes: user.tokenScopes
    }
  });
}

