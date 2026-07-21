import { NextRequest, NextResponse } from "next/server";
import { createPlainApiToken, hashApiToken } from "@/lib/integration-auth";
import { hashOAuthSecret, oauthError, oauthResource, verifyPkce } from "@/lib/oauth";
import { prisma } from "@/lib/prisma";

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  if (!form) return oauthError("invalid_request", "Form-encoded Body ist erforderlich.");

  const grantType = String(form.get("grant_type") || "");
  if (grantType !== "authorization_code") return oauthError("unsupported_grant_type", "Nur authorization_code wird unterstuetzt.");

  const code = String(form.get("code") || "");
  const redirectUri = String(form.get("redirect_uri") || "");
  const clientId = String(form.get("client_id") || "");
  const codeVerifier = String(form.get("code_verifier") || "");
  const resource = String(form.get("resource") || oauthResource());

  if (!code || !redirectUri || !clientId || !codeVerifier) {
    return oauthError("invalid_request", "code, redirect_uri, client_id und code_verifier sind erforderlich.");
  }

  const authorizationCode = await prisma.oAuthAuthorizationCode.findUnique({
    where: { codeHash: hashOAuthSecret(code) },
    include: { user: true }
  });
  if (!authorizationCode || authorizationCode.consumedAt || authorizationCode.expiresAt < new Date()) {
    return oauthError("invalid_grant", "Authorization Code ist ungueltig oder abgelaufen.", 400);
  }
  if (authorizationCode.clientId !== clientId || authorizationCode.redirectUri !== redirectUri) {
    return oauthError("invalid_grant", "Authorization Code passt nicht zu Client oder Redirect-URI.", 400);
  }
  if (authorizationCode.resource !== resource || resource !== oauthResource()) {
    return oauthError("invalid_target", "resource passt nicht zu diesem MCP-Server.", 400);
  }
  if (!verifyPkce(codeVerifier, authorizationCode.codeChallenge, authorizationCode.codeChallengeMethod)) {
    return oauthError("invalid_grant", "PKCE-Verifizierung fehlgeschlagen.", 400);
  }
  if (!authorizationCode.user.active) {
    return oauthError("invalid_grant", "Benutzer ist deaktiviert.", 400);
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
