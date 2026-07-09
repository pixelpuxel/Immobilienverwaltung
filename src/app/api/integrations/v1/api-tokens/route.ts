import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createPlainApiToken, hashApiToken, integrationError, requireIntegrationUser } from "@/lib/integration-auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

const tokenSchema = z.object({
  name: z.string().trim().min(1),
  scopes: z.array(z.string().trim().min(1)).min(1),
  expiresAt: z.string().datetime().nullable().optional()
});

export async function GET(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request);
  if (!user) return response;
  const forbidden = requireAdmin(user);
  if (forbidden) return forbidden;

  const tokens = await prisma.apiToken.findMany({
    where: { user: portalWhere(user) },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      scopes: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
      user: { select: { email: true, name: true, username: true } }
    }
  });

  return NextResponse.json({ items: tokens, nextCursor: null });
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["write:settings"]);
  if (!user) return response;
  const forbidden = requireAdmin(user);
  if (forbidden) return forbidden;

  const parsed = tokenSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return integrationError("BAD_REQUEST", "Bitte Token-Name und Scopes pruefen.", 400);
  }

  const token = createPlainApiToken();
  const apiToken = await prisma.apiToken.create({
    data: {
      userId: user.id,
      portalInstanceId: user.portalInstanceId,
      name: parsed.data.name,
      scopes: parsed.data.scopes,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      tokenHash: hashApiToken(token)
    },
    select: {
      id: true,
      name: true,
      scopes: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
      user: { select: { email: true, name: true, username: true } }
    }
  });

  return NextResponse.json({ token, apiToken }, { status: 201 });
}

function requireAdmin(user: { role: Role }) {
  if (user.role !== Role.ADMIN) {
    return integrationError("FORBIDDEN", "Dieser Endpunkt braucht einen Eigentuemer-Token.", 403);
  }
  return null;
}
