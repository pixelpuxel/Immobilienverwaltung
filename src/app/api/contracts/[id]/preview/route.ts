import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { verifyContractDownloadToken } from "@/lib/contract-downloads";
import { readPrivateFile } from "@/lib/files";
import { brokerPropertyIds } from "@/lib/permissions";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const signed = verifyContractDownloadToken(params.id, "pdf", request.nextUrl.searchParams.get("expires"), request.nextUrl.searchParams.get("token"), "preview");
  const user = signed ? null : await requireApiUser(request);
  if (!signed && !user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

  const contract = await prisma.leaseContract.findFirst({ where: { id: params.id, ...(user ? { unit: { property: portalWhere(user) } } : {}) }, include: { tenantProfile: true, unit: true } });
  const brokerCanAccess = user?.role === Role.BROKER && contract ? (await brokerPropertyIds(user.id)).includes(contract.unit.propertyId) : false;
  if (!contract || (!signed && user && user.role !== Role.ADMIN && contract.tenantProfile.userId !== user.id && !brokerCanAccess)) {
    return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  }

  const filePath = contract.pdfPath || contract.docxPath;
  const body = await readPrivateFile(filePath);
  const isPdf = Boolean(contract.pdfPath);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": isPdf ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `inline; filename="${isPdf ? "mietvertrag.pdf" : "mietvertrag.docx"}"`,
      "Cache-Control": "private, max-age=120"
    }
  });
}
