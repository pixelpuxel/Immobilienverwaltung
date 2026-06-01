import { NextRequest, NextResponse } from "next/server";
import { requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";

export async function POST(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["backup:import"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;
  return NextResponse.json({
    error: {
      code: "NOT_IMPLEMENTED",
      message: "Backup-Import per Bearer Token ist vorbereitet, aber noch nicht freigeschaltet. Bitte aktuell den bestehenden Cookie-Endpunkt /api/backup/import verwenden."
    }
  }, { status: 501 });
}

