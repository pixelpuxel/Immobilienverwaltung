import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";
import { generateWohnungsgeberbestaetigung } from "@/lib/wohnungsgeber";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!assertSameOrigin(request)) {
    return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  }
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nur Eigentümer duerfen die Wohnungsgeberbestaetigung erstellen." }, { status: 403 });

  const tenant = await prisma.tenantProfile.findFirst({ where: { id: params.id, user: portalWhere(user) } });
  if (!tenant) return NextResponse.json({ error: "Mieter wurde nicht gefunden." }, { status: 404 });
  try {
    const document = await generateWohnungsgeberbestaetigung({ tenantProfileId: tenant.id, actorUserId: user.id });
    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Dokument konnte nicht erstellt werden." }, { status: 400 });
  }
}
