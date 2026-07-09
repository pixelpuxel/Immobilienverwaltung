import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { isMailConfigured } from "@/lib/mail";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request);
  if (!user) return response;

  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;

  const owner = await prisma.user.findUnique({
    where: { id: user.id },
    select: { email: true, contactEmail: true, portalInstanceId: true, role: true }
  });

  const tenantCount = await prisma.user.count({
    where: {
      role: Role.TENANT,
      active: true,
      ...(user.portalInstanceId ? { portalInstanceId: user.portalInstanceId } : {})
    }
  });

  return NextResponse.json({
    configured: isMailConfigured(),
    smtpHost: env.smtpHost || null,
    smtpPort: env.smtpPort,
    smtpFrom: env.smtpFrom || null,
    defaultTo: owner?.contactEmail || owner?.email || user.email,
    tenantRecipientCount: tenantCount
  });
}
