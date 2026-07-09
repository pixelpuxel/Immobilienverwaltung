import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationUser } from "@/lib/integration-auth";
import { serializeDocument } from "@/lib/integration-data";
import { integrationTenantAccessWhere } from "@/lib/integration-document-access";
import { prisma } from "@/lib/prisma";
import { generateWohnungsgeberbestaetigung } from "@/lib/wohnungsgeber";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["write:documents"]);
  if (!user) return response;
  if (user.role !== Role.ADMIN) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Nur Eigentuemer duerfen die Wohnungsgeberbestaetigung erstellen." } }, { status: 403 });
  }

  const tenant = await prisma.tenantProfile.findFirst({
    where: { AND: [{ id: params.id }, await integrationTenantAccessWhere(user)] },
    select: { id: true }
  });
  if (!tenant) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Mieter wurde nicht gefunden." } }, { status: 404 });
  }

  try {
    const document = await generateWohnungsgeberbestaetigung({ tenantProfileId: tenant.id, actorUserId: user.id });
    const freshDocument = await prisma.document.findUnique({
      where: { id: document.id },
      include: {
        property: { select: { id: true, name: true } },
        unit: { select: { id: true, unitNumber: true, property: { select: { id: true, name: true } } } },
        tenantProfile: { select: { id: true, firstName: true, lastName: true, email: true, userId: true } },
        category: true
      }
    });
    return NextResponse.json(freshDocument ? serializeDocument(freshDocument) : document, { status: 201 });
  } catch (error) {
    return NextResponse.json({
      error: {
        code: "BAD_REQUEST",
        message: error instanceof Error ? error.message : "Dokument konnte nicht erstellt werden."
      }
    }, { status: 400 });
  }
}
