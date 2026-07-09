import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationUser } from "@/lib/integration-auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request);
  if (!user) return response;

  const owner = await prisma.user.findFirst({
    where: { role: Role.ADMIN, active: true, ...portalWhere(user) },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      username: true,
      name: true,
      contactPerson: true,
      contactAddress: true,
      contactPhone: true,
      contactEmail: true
    }
  });

  if (!owner) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Eigentuemerkontakt nicht gefunden." } }, { status: 404 });
  }

  return NextResponse.json({
    id: owner.id,
    email: owner.email,
    username: owner.username,
    name: owner.name,
    contactPerson: owner.contactPerson,
    contactAddress: owner.contactAddress,
    contactPhone: owner.contactPhone,
    contactEmail: owner.contactEmail,
    displayName: owner.contactPerson || owner.name || owner.username || owner.email,
    displayEmail: owner.contactEmail || owner.email
  });
}
