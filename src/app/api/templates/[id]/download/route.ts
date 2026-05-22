import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { readPrivateFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });

  const template = await prisma.contractTemplate.findUnique({ where: { id: params.id } });
  if (!template) return NextResponse.json({ error: "Vorlage wurde nicht gefunden." }, { status: 404 });
  const body = await readPrivateFile(template.storagePath);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": template.mimeType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(template.filename)}"`
    }
  });
}
