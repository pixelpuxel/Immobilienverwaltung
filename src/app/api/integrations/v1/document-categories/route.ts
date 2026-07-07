import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationUser } from "@/lib/integration-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["read:documents"]);
  if (!user) return response;

  const categories = await prisma.documentCategory.findMany({
    where: {
      OR: [
        { portalInstanceId: null },
        { portalInstanceId: user.portalInstanceId }
      ]
    },
    orderBy: [{ group: "asc" }, { name: "asc" }]
  });

  return NextResponse.json({ items: categories, nextCursor: null });
}
