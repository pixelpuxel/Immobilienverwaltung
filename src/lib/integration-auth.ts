import { Role } from "@prisma/client";
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const TOKEN_PREFIX = "ip_live_";

export type IntegrationUser = {
  id: string;
  email: string;
  username: string | null;
  name: string | null;
  role: Role;
  active: boolean;
  portalInstanceId: string | null;
  platformAdmin: boolean;
  tokenId: string;
  tokenName: string;
  tokenScopes: string[];
};

export function createPlainApiToken() {
  return `${TOKEN_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
}

export function hashApiToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function requireIntegrationUser(request: NextRequest, scopes: string[] = []) {
  const auth = request.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return { user: null, response: integrationError("UNAUTHORIZED", "Bearer Token fehlt.", 401) };

  const tokenHash = hashApiToken(match[1].trim());
  const apiToken = await prisma.apiToken.findUnique({
    where: { tokenHash },
    include: { user: true }
  });
  if (!apiToken || apiToken.revokedAt) return { user: null, response: integrationError("UNAUTHORIZED", "Token ist ungueltig oder widerrufen.", 401) };
  if (apiToken.expiresAt && apiToken.expiresAt < new Date()) return { user: null, response: integrationError("UNAUTHORIZED", "Token ist abgelaufen.", 401) };
  if (!apiToken.user.active) return { user: null, response: integrationError("FORBIDDEN", "Benutzer ist deaktiviert.", 403) };

  const missingScopes = scopes.filter((scope) => !apiToken.scopes.includes(scope));
  if (missingScopes.length) {
    return { user: null, response: integrationError("FORBIDDEN", `Token braucht Scope: ${missingScopes.join(", ")}`, 403) };
  }

  await prisma.apiToken.update({ where: { id: apiToken.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  const user: IntegrationUser = {
    id: apiToken.user.id,
    email: apiToken.user.email,
    username: apiToken.user.username,
    name: apiToken.user.name,
    role: apiToken.user.role,
    active: apiToken.user.active,
    portalInstanceId: apiToken.portalInstanceId ?? apiToken.user.portalInstanceId,
    platformAdmin: apiToken.user.platformAdmin,
    tokenId: apiToken.id,
    tokenName: apiToken.name,
    tokenScopes: apiToken.scopes
  };
  return { user, response: null };
}

export function integrationError(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export function requireAdminIntegration(user: IntegrationUser) {
  if (user.role !== Role.ADMIN) return integrationError("FORBIDDEN", "Dieser Endpunkt braucht einen Admin-/Eigentuemertoken.", 403);
  return null;
}

