import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminIntegration, requireIntegrationUser, integrationError } from "@/lib/integration-auth";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  group: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().optional().nullable(),
  visibleToBroker: z.boolean().optional(),
  visibleToTenant: z.boolean().optional()
});

const updateVisibilitySchema = z.object({
  id: z.string().min(1),
  visibleToBroker: z.boolean(),
  visibleToTenant: z.boolean()
});

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

export async function POST(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["write:settings"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;

  const body = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return integrationError("BAD_REQUEST", "Ungueltige Kategorie-Daten.", 400);

  const category = await prisma.documentCategory.create({
    data: {
      group: body.data.group,
      name: body.data.name,
      description: body.data.description || null,
      visibleToBroker: body.data.visibleToBroker ?? true,
      visibleToTenant: body.data.visibleToTenant ?? false,
      portalInstanceId: user.portalInstanceId
    }
  });
  return NextResponse.json(category, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["write:settings"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;

  const body = updateVisibilitySchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return integrationError("BAD_REQUEST", "Ungueltige Sichtbarkeits-Daten.", 400);

  const existing = await prisma.documentCategory.findFirst({
    where: {
      id: body.data.id,
      OR: [{ portalInstanceId: null }, { portalInstanceId: user.portalInstanceId }]
    }
  });
  if (!existing) return integrationError("NOT_FOUND", "Kategorie wurde nicht gefunden.", 404);

  const category = await prisma.documentCategory.update({
    where: { id: existing.id },
    data: {
      visibleToBroker: body.data.visibleToBroker,
      visibleToTenant: body.data.visibleToTenant
    }
  });
  return NextResponse.json(category);
}
