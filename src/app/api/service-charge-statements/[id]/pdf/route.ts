import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";
import { buildServiceChargeStatementSnapshot, isServiceChargeStatementSnapshot, serviceChargeSnapshotChecksum } from "@/lib/service-charge-statement";
import { renderServiceChargeStatementPdf, serviceChargeStatementPdfFilename } from "@/lib/service-charge-statement-pdf";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireApiUser(request);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const statement = await prisma.serviceChargeStatement.findFirst({
    where: { id: params.id, deletedAt: null, property: portalWhere(user) }
  });
  if (!statement || !isServiceChargeStatementSnapshot(statement.snapshot)) {
    return NextResponse.json({ error: "Abrechnung nicht gefunden oder ungueltig." }, { status: 404 });
  }
  let tenantId = request.nextUrl.searchParams.get("tenantId") || "";
  if (user.role === Role.TENANT) {
    const profile = await prisma.tenantProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!profile) return NextResponse.json({ error: "Kein Mietprofil vorhanden." }, { status: 403 });
    tenantId = profile.id;
  } else if (user.role !== Role.ADMIN) {
    return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  }
  const snapshot = await snapshotWithCurrentDetails(statement.snapshot, statement.propertyId, statement.year, user);
  const checksum = snapshot === statement.snapshot ? statement.checksum : serviceChargeSnapshotChecksum(snapshot);
  const tenant = tenantId
    ? snapshot.allocation.tenantResults.find((item) => item.tenantId === tenantId)
    : null;
  if (tenantId && !tenant) return NextResponse.json({ error: "Mietverhaeltnis gehoert nicht zu dieser Abrechnung." }, { status: 403 });
  const pdf = renderServiceChargeStatementPdf({
    snapshot,
    version: statement.version,
    status: statement.status,
    checksum,
    tenantId: tenant?.tenantId
  });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(serviceChargeStatementPdfFilename(snapshot, statement.version, tenant?.tenantName))}"`,
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
