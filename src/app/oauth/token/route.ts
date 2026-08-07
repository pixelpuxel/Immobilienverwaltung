import { NextRequest, NextResponse } from "next/server";
import { createPlainApiToken, hashApiToken } from "@/lib/integration-auth";
import { hashOAuthSecret, oauthError, parseOAuthResource, verifyPkce } from "@/lib/oauth";
import { prisma } from "@/lib/prisma";

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

export async function POST(request: NextRequest) {
  const body = await readTokenRequestBody(request);

  const grantType = String(body.grant_type || "");
  if (grantType !== "authorization_code") return oauthError("unsupported_grant_type", "Nur authorization_code wird unterstuetzt.");

  const code = String(body.code || "");
  const redirectUri = String(body.redirect_uri || "");
  const requestedClientId = String(body.client_id || "");
  const codeVerifier = String(body.code_verifier || "");
  const requestedResource = String(body.resource || "");

  if (!code || !codeVerifier) {
    return logAndReturnTokenError("invalid_request", "code und code_verifier sind erforderlich.");
  }

  const authorizationCode = await prisma.oAuthAuthorizationCode.findUnique({
    where: { codeHash: hashOAuthSecret(code) },
    include: { user: true }
  });
  if (!authorizationCode || authorizationCode.consumedAt || authorizationCode.expiresAt < new Date()) {
    return logAndReturnTokenError("invalid_grant", "Authorization Code ist ungueltig oder abgelaufen.");
  }

  const clientId = requestedClientId || authorizationCode.clientId;
  const authorizationResource = parseOAuthResource(authorizationCode.resource);
  const requestedResourceTarget = requestedResource ? parseOAuthResource(requestedResource) : authorizationResource;
  if (authorizationCode.clientId !== clientId) {
    return logAndReturnTokenError("invalid_grant", "Authorization Code passt nicht zum Client.");
  }
  if (redirectUri && authorizationCode.redirectUri !== redirectUri) {
    return logAndReturnTokenError("invalid_grant", "Authorization Code passt nicht zur Redirect-URI.");
  }
  if (!authorizationResource || !requestedResourceTarget || authorizationResource.resource !== requestedResourceTarget.resource) {
    return logAndReturnTokenError("invalid_target", "resource passt nicht zu diesem MCP-Server.");
  }
  const resource = authorizationResource.resource;
  if (!verifyPkce(codeVerifier, authorizationCode.codeChallenge, authorizationCode.codeChallengeMethod)) {
    return logAndReturnTokenError("invalid_grant", "PKCE-Verifizierung fehlgeschlagen.");
  }
  if (!authorizationCode.user.active) {
    return logAndReturnTokenError("invalid_grant", "Benutzer ist deaktiviert.");
  }

  const plainToken = createPlainApiToken();
  const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
  await prisma.$transaction([
    prisma.oAuthAuthorizationCode.update({ where: { id: authorizationCode.id }, data: { consumedAt: new Date() } }),
    prisma.apiToken.create({
      data: {
        userId: authorizationCode.userId,
        portalInstanceId: authorizationCode.portalInstanceId,
        name: `OAuth: ${client?.clientName || clientId}`.slice(0, 180),
        tokenHash: hashApiToken(plainToken),
        scopes: authorizationCode.scopes,
        expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000)
      }
    })
  ]);

  return NextResponse.json({
    access_token: plainToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    scope: authorizationCode.scopes.join(" "),
    resource
  });
}

async function readTokenRequestBody(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return (await request.json().catch(() => ({}))) as Record<string, unknown>;
  }
  const form = await request.formData().catch(() => null);
  if (!form) return {};
  return Object.fromEntries(Array.from(form.entries()).map(([key, value]) => [key, String(value)]));
}

function logAndReturnTokenError(error: string, description: string) {
  console.warn(`[oauth/token] ${error}: ${description}`);
  return oauthError(error, description, 400);
}
