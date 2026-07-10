import { AuditAction, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { clientIp, verifyPassword } from "@/lib/auth";
import { createPlainApiToken, hashApiToken } from "@/lib/integration-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  identifier: z.string().trim().min(1),
  password: z.string().min(1),
  deviceName: z.string().trim().optional()
});

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  if (!checkRateLimit(`mobile-login:${ip}`)) {
    return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Zu viele Versuche." } }, { status: 429 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Bitte Zugangsdaten pruefen." } }, { status: 400 });
  }

  const identifier = parsed.data.identifier.toLowerCase();
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: identifier },
        { username: identifier }
      ]
    }
  });

  if (!user || !user.active || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Benutzername/E-Mail oder Passwort ist falsch." } }, { status: 401 });
  }

  const token = createPlainApiToken();
  const scopes = mobileScopesForRole(user.role);
  const apiToken = await prisma.apiToken.create({
    data: {
      userId: user.id,
      portalInstanceId: user.portalInstanceId,
      name: parsed.data.deviceName || "iPhone-App",
      scopes,
      tokenHash: hashApiToken(token)
    },
    select: {
      id: true,
      name: true,
      scopes: true
    }
  });

  await auditLog({ userId: user.id, action: AuditAction.LOGIN, ipAddress: ip });

  return NextResponse.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      name: user.name,
      role: user.role,
      portalInstanceId: user.portalInstanceId,
      platformAdmin: user.platformAdmin
    },
    tokenInfo: apiToken
  });
}

function mobileScopesForRole(role: Role) {
  if (role === Role.ADMIN) {
    return [
      "read:properties",
      "write:properties",
      "read:units",
      "write:units",
      "read:documents",
      "write:documents",
      "download:documents",
      "read:tenants",
      "write:tenants",
      "read:contracts",
      "write:contracts",
      "read:settings",
      "write:settings",
      "backup:export",
      "backup:import"
    ];
  }

  if (role === Role.BROKER) {
    return [
      "read:properties",
      "write:properties",
      "read:units",
      "read:documents",
      "download:documents",
      "read:tenants",
      "read:contracts"
    ];
  }

  if (role === Role.TAX_ADVISOR) {
    return [
      "read:documents",
      "download:documents"
    ];
  }

  return [
    "read:documents",
    "download:documents",
    "read:tenants",
    "read:contracts"
  ];
}
