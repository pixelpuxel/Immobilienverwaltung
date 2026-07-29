import { NextRequest, NextResponse } from "next/server";
import { requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";
import { isServiceChargeStatementSnapshot } from "@/lib/service-charge-statement";
import { renderServiceChargeStatementPdf, serviceChargeStatementPdfFilename } from "@/lib/service-charge-statement-pdf";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["read:properties"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;
  const item = await prisma.serviceChargeStatement.findFirst({
    where: { id: params.id, deletedAt: null, property: portalWhere(user) }
  });
  if (!item || !isServiceChargeStatementSnapshot(item.snapshot)) {
    return NextResponse.json({ error: "Abrechnung nicht gefunden." }, { status: 404 });
  }
  const pdf = renderServiceChargeStatementPdf({
    snapshot: item.snapshot,
    version: item.version,
    status: item.status,
    checksum: item.checksum
  });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(serviceChargeStatementPdfFilename(item.snapshot, item.version))}"`,
      "Cache-Control": "private, no-store"
    }
  });
}
