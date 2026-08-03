import { NextRequest, NextResponse } from "next/server";
import { integrationError, requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { createServiceChargeLine, deleteServiceChargeLine, serviceChargeLineMutationSchema, ServiceChargeWorkspaceError } from "@/lib/service-charge-workspace";

export async function POST(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["write:properties"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;
  const parsed = serviceChargeLineMutationSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return integrationError("BAD_REQUEST", "Bitte Kostenposition pruefen.", 400);
  try {
    const line = await createServiceChargeLine(user, parsed.data);
    return NextResponse.json({ ...line, amount: Number(line.amount) }, { status: 201 });
  } catch (error) {
    if (error instanceof ServiceChargeWorkspaceError) return integrationError("SERVICE_CHARGE_LINE_ERROR", error.message, error.status);
    return integrationError("SERVICE_CHARGE_LINE_ERROR", "Kostenposition konnte nicht gespeichert werden.", 500);
  }
}

export async function DELETE(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["write:properties"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;
  const id = request.nextUrl.searchParams.get("id") || "";
  if (!id) return integrationError("BAD_REQUEST", "Kostenposition fehlt.", 400);
  try {
    await deleteServiceChargeLine(user, id);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (error instanceof ServiceChargeWorkspaceError) return integrationError("SERVICE_CHARGE_LINE_ERROR", error.message, error.status);
    return integrationError("SERVICE_CHARGE_LINE_ERROR", "Kostenposition konnte nicht geloescht werden.", 500);
  }
}
