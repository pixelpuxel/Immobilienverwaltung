import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { indexAllDocuments } from "@/lib/ai-search";
import { integrationError, requireIntegrationUser } from "@/lib/integration-auth";

export async function POST(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["write:settings"]);
  if (!user) return response;
  if (user.role !== Role.ADMIN) {
    return integrationError("FORBIDDEN", "Dieser Endpunkt braucht einen Eigentuemer-Token.", 403);
  }
  const result = await indexAllDocuments(user.portalInstanceId);
  return NextResponse.json({ ok: true, ...result });
}
