import { NextRequest, NextResponse } from "next/server";
import { requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";
import { buildServiceChargeStatementSnapshot, isServiceChargeStatementSnapshot, serviceChargeSnapshotChecksum } from "@/lib/service-charge-statement";
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
  const snapshot = await snapshotWithCurrentDetails(item.snapshot, item.propertyId, item.year, user);
  const checksum = snapshot === item.snapshot ? item.checksum : serviceChargeSnapshotChecksum(snapshot);
  const tenantId = request.nextUrl.searchParams.get("tenantId") || "";
  const tenant = tenantId
    ? snapshot.allocation.tenantResults.find((result) => result.tenantId === tenantId)
    : null;
  if (tenantId && !tenant) {
    return NextResponse.json({ error: "Mietverhaeltnis gehoert nicht zu dieser Abrechnung." }, { status: 403 });
  }
  const pdf = renderServiceChargeStatementPdf({
    snapshot,
    version: item.version,
    status: item.status,
    checksum,
    tenantId: tenant?.tenantId
  });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(serviceChargeStatementPdfFilename(snapshot, item.version, tenant?.tenantName))}"`,
      "Cache-Control": "private, no-store"
    }
  });
}

async function snapshotWithCurrentDetails(
  snapshot: Parameters<typeof renderServiceChargeStatementPdf>[0]["snapshot"],
  propertyId: string,
  year: number,
  user: { portalInstanceId: string | null }
) {
  if (snapshot.source?.bankingDetails) return snapshot;
  return buildServiceChargeStatementSnapshot({ user, propertyId, year }).catch(() => snapshot);
}
