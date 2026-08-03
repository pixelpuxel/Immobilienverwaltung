import { NextRequest, NextResponse } from "next/server";
import { integrationError, requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { saveServiceChargeRule, serviceChargeRuleMutationSchema, ServiceChargeWorkspaceError } from "@/lib/service-charge-workspace";

export async function PUT(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["write:properties"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;
  const parsed = serviceChargeRuleMutationSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return integrationError("BAD_REQUEST", "Bitte Verteilerschluessel pruefen.", 400);
  try {
    const rule = await saveServiceChargeRule(user, parsed.data);
    return NextResponse.json({
      id: rule.id,
      propertyId: rule.propertyId,
      year: rule.year,
      method: rule.method,
      totalDistributionValue: rule.totalDistributionValue === null ? null : Number(rule.totalDistributionValue),
      note: rule.note || "",
      unitValues: Object.fromEntries(rule.unitAllocations.map((item) => [item.unitId, Number(item.value)]))
    });
  } catch (error) {
    if (error instanceof ServiceChargeWorkspaceError) return integrationError("SERVICE_CHARGE_RULE_ERROR", error.message, error.status);
    return integrationError("SERVICE_CHARGE_RULE_ERROR", "Verteilerschluessel konnte nicht gespeichert werden.", 500);
  }
}
