import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createPlainApiToken, hashApiToken, integrationError, requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  instanceId: z.string().trim().min(1).optional(),
  portalInstanceId: z.string().trim().min(1).optional()
}).refine((value) => Boolean(value.instanceId || value.portalInstanceId), {
  message: "Portal-Instanz fehlt.",
  path: ["instanceId"]
});

export async function POST(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["write:settings"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;
  if (!user.platformAdmin) {
    return integrationError("FORBIDDEN", "Nur Plattform-Eigentuemer duerfen Portal-Instanzen wechseln.", 403);
  }

  const body = schema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return integrationError("BAD_REQUEST", "Ungueltige Portal-Instanz.", 400);

  const instanceId = body.data.instanceId || body.data.portalInstanceId;
  if (!instanceId) return integrationError("BAD_REQUEST", "Ungueltige Portal-Instanz.", 400);
  const instance = await prisma.portalInstance.findUnique({
    where: { id: instanceId },
    include: {
      users: {
        where: { role: Role.ADMIN, active: true },
        orderBy: { createdAt: "asc" },
        take: 1
      }
    }
  });
  if (!instance) return integrationError("NOT_FOUND", "Portal-Instanz wurde nicht gefunden.", 404);
  const target = instance.users[0];
  if (!target) return integrationError("NOT_FOUND", "Portal-Instanz hat keinen aktiven Eigentuemer.", 404);

  const plainToken = createPlainApiToken();
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
  const apiToken = await prisma.apiToken.create({
    data: {
      userId: target.id,
      portalInstanceId: instance.id,
      name: `iOS Instanz: ${instance.name}`,
      tokenHash: hashApiToken(plainToken),
      scopes: user.tokenScopes,
      expiresAt
    }
  });

  return NextResponse.json({
    token: plainToken,
    expiresAt,
    user: {
      id: target.id,
      email: target.email,
      username: target.username,
      name: target.name,
      role: target.role,
      portalInstanceId: target.portalInstanceId,
      platformAdmin: target.platformAdmin
    },
    tokenInfo: {
      id: apiToken.id,
      name: apiToken.name,
      scopes: apiToken.scopes
    }
  });
}
