import { NextRequest, NextResponse } from "next/server";
import { requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["read:contracts"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;
  const templates = await prisma.contractTemplate.findMany({
    where: portalWhere(user),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      filename: true,
      mimeType: true,
      size: true,
      createdAt: true
    }
  });
  return NextResponse.json({
    items: templates.map((template) => ({
      ...template,
      previewUrl: `/api/templates/${template.id}/preview`,
      downloadUrl: `/api/templates/${template.id}/download`
    })),
    nextCursor: null
  });
}
