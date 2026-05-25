import { Role } from "@prisma/client";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { readPrivateFile } from "@/lib/files";
import { brokerPropertyIds } from "@/lib/permissions";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireApiUser(request);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const contract = await prisma.leaseContract.findFirst({ where: { id: params.id, unit: { property: portalWhere(user) } }, include: { tenantProfile: true, unit: { include: { property: true } } } });
  const brokerCanAccess = user.role === Role.BROKER && contract ? (await brokerPropertyIds(user.id)).includes(contract.unit.propertyId) : false;
  if (!contract || (user.role !== Role.ADMIN && contract.tenantProfile.userId !== user.id && !brokerCanAccess)) {
    return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  }
  const format = request.nextUrl.searchParams.get("format") === "pdf" ? "pdf" : "docx";
  const actualFormat = format === "pdf" && contract.pdfPath ? "pdf" : "docx";
  const filePath = actualFormat === "pdf" ? contract.pdfPath! : contract.docxPath;
  const body = await readPrivateFile(filePath);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": actualFormat === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(contractFilename(contract, actualFormat))}"`
    }
  });
}

function contractFilename(contract: {
  docxPath: string;
  pdfPath: string | null;
  tenantProfile: { firstName: string; lastName: string };
  unit: { unitNumber: string; property: { name: string } };
}, format: "pdf" | "docx") {
  const existing = path.basename(format === "pdf" && contract.pdfPath ? contract.pdfPath : contract.docxPath);
  if (existing && existing.includes("Mietvertrag_")) return existing.replace(/\.(docx|pdf)$/i, `.${format}`);
  const date = new Intl.DateTimeFormat("de-DE").format(new Date()).replace(/\./g, "-");
  return safe(`Mietvertrag_${contract.unit.property.name}_${contract.unit.unitNumber}_${contract.tenantProfile.firstName}${contract.tenantProfile.lastName}_${date}.${format}`);
}

function safe(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
}
