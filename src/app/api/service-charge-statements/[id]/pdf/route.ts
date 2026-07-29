import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";
import { isServiceChargeStatementSnapshot } from "@/lib/service-charge-statement";
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
  const pdf = renderServiceChargeStatementPdf({
    snapshot: statement.snapshot,
    version: statement.version,
    status: statement.status,
    checksum: statement.checksum
  });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(serviceChargeStatementPdfFilename(statement.snapshot, statement.version))}"`,
      "Cache-Control": "private, no-store"
    }
  });
}
