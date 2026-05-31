import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { buildDocumentMetadata } from "@/lib/document-metadata";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const force = request.nextUrl.searchParams.get("force") === "1";

  const documents = await prisma.document.findMany({
    where: force ? portalWhere(user) : { ...portalWhere(user), OR: [{ summary: null }, { tags: { isEmpty: true } }] },
    include: { property: true, unit: { include: { property: true } }, category: true },
    take: 2500
  });
  let updated = 0;
  for (const document of documents) {
    await prisma.document.update({
      where: { id: document.id },
      data: buildDocumentMetadata(document)
    });
    updated += 1;
  }
  return NextResponse.json({ ok: true, updated });
}
