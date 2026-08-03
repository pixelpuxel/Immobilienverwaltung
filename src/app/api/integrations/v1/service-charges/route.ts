import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { integrationError, requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { loadServiceChargeWorkspace, ServiceChargeWorkspaceError } from "@/lib/service-charge-workspace";

const querySchema = z.object({
  propertyId: z.string().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  unitId: z.string().min(1).optional(),
  tenantId: z.string().min(1).optional()
});

export async function GET(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["read:properties"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return integrationError("BAD_REQUEST", "Immobilie und Abrechnungsjahr pruefen.", 400);
  try {
    return NextResponse.json(await loadServiceChargeWorkspace({ user, ...parsed.data }));
  } catch (error) {
    if (error instanceof ServiceChargeWorkspaceError) {
      return integrationError("SERVICE_CHARGE_WORKSPACE_ERROR", error.message, error.status);
    }
    return integrationError("SERVICE_CHARGE_WORKSPACE_ERROR", error instanceof Error ? error.message : "Abrechnungsdaten konnten nicht geladen werden.", 500);
  }
}
