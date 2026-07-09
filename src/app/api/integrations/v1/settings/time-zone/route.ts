import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { integrationError, requireIntegrationUser } from "@/lib/integration-auth";
import { DEFAULT_TIME_ZONE, getPortalTimeZone, isValidTimeZone, TIME_ZONE_OPTIONS } from "@/lib/time-zone";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  timeZone: z.string().trim().min(1)
});

export async function GET(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request);
  if (!user) return response;
  const forbidden = requireAdminPortalUser(user);
  if (forbidden) return forbidden;

  const timeZone = await getPortalTimeZone(user.portalInstanceId);
  return NextResponse.json({ timeZone, options: TIME_ZONE_OPTIONS });
}

export async function PATCH(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["write:settings"]);
  if (!user) return response;
  const forbidden = requireAdminPortalUser(user);
  if (forbidden) return forbidden;

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success || !isValidTimeZone(parsed.data.timeZone)) {
    return integrationError("BAD_REQUEST", "Bitte eine gueltige Zeitzone eingeben.", 400);
  }

  const portal = await prisma.portalInstance.update({
    where: { id: user.portalInstanceId || "" },
    data: { timeZone: parsed.data.timeZone },
    select: { timeZone: true }
  });

  return NextResponse.json({ timeZone: portal.timeZone || DEFAULT_TIME_ZONE, options: TIME_ZONE_OPTIONS });
}

function requireAdminPortalUser(user: { role: Role; portalInstanceId: string | null }) {
  if (user.role !== Role.ADMIN) {
    return integrationError("FORBIDDEN", "Dieser Endpunkt braucht einen Eigentuemer-Token.", 403);
  }
  if (!user.portalInstanceId) {
    return integrationError("BAD_REQUEST", "Keine Portal-Instanz gefunden.", 400);
  }
  return null;
}
