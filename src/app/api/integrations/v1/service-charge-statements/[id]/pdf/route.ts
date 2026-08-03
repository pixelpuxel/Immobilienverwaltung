import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { integrationError, requireIntegrationUser } from "@/lib/integration-auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";
import { buildServiceChargeStatementSnapshot, isServiceChargeStatementSnapshot, serviceChargeSnapshotChecksum, serviceChargeTenantResult } from "@/lib/service-charge-statement";
import { renderServiceChargeStatementPdf, serviceChargeStatementPdfFilename } from "@/lib/service-charge-statement-pdf";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request);
  if (!user) return response;
  if (user.role === Role.ADMIN && !user.tokenScopes.includes("read:properties")) {
    return integrationError("FORBIDDEN", "Token braucht Scope: read:properties", 403);
  }
  if (user.role === Role.TENANT && !user.tokenScopes.includes("read:documents")) {
    return integrationError("FORBIDDEN", "Token braucht Scope: read:documents", 403);
  }
  if (user.role !== Role.ADMIN && user.role !== Role.TENANT) {
    return integrationError("FORBIDDEN", "Nebenkostenabrechnungen sind nur fuer Eigentuemer und den betroffenen Mieter sichtbar.", 403);
  }
  const item = await prisma.serviceChargeStatement.findFirst({
    where: { id: params.id, deletedAt: null, property: portalWhere(user) }
  });
  if (!item || !isServiceChargeStatementSnapshot(item.snapshot)) {
    return NextResponse.json({ error: "Abrechnung nicht gefunden." }, { status: 404 });
  }
  if (user.role === Role.TENANT && item.status !== "FINAL") {
    return NextResponse.json({ error: "Abrechnung nicht gefunden." }, { status: 404 });
  }
  const snapshot = user.role === Role.TENANT
    ? item.snapshot
    : await snapshotWithCurrentDetails(item.snapshot, item.propertyId, item.year, user);
  const checksum = snapshot === item.snapshot ? item.checksum : serviceChargeSnapshotChecksum(snapshot);
  let tenantId = request.nextUrl.searchParams.get("tenantId") || "";
  if (user.role === Role.TENANT) {
    const tenantProfiles = await prisma.tenantProfile.findMany({
      where: { userId: user.id, unit: { property: portalWhere(user) } },
      select: { id: true }
    });
    const result = serviceChargeTenantResult(snapshot, tenantProfiles.map((profile) => profile.id));
    if (!result) {
      return NextResponse.json({ error: "Abrechnung nicht gefunden." }, { status: 404 });
    }
    if (tenantId && tenantId !== result.tenantId) {
      return NextResponse.json({ error: "Abrechnung nicht gefunden." }, { status: 404 });
    }
    tenantId = result.tenantId;
  }
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
