import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { readPrivateFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireApiUser(request);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

  const contract = await prisma.leaseContract.findUnique({ where: { id: params.id }, include: { tenantProfile: true } });
  if (!contract || (user.role !== Role.ADMIN && contract.tenantProfile.userId !== user.id)) {
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
