import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createOAuthSecret,
  hashOAuthSecret,
  isAllowedOAuthResource,
  normalizeScopes,
  oauthResource,
  redirectWithOAuthError
} from "@/lib/oauth";
import { resolveOAuthResourceTarget } from "@/lib/oauth-resource";

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) {
    return NextResponse.json({ error: "invalid_request", error_description: "Ungueltiger Ursprung." }, { status: 403 });
  }
  const user = await requireApiUser(request);
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const form = await request.formData();
  const decision = String(form.get("decision") || "");
  const clientId = String(form.get("client_id") || "");
  const redirectUri = String(form.get("redirect_uri") || "");
  const state = String(form.get("state") || "");
  const codeChallenge = String(form.get("code_challenge") || "");
  const codeChallengeMethod = String(form.get("code_challenge_method") || "");
  const resource = String(form.get("resource") || oauthResource());
  const scopes = normalizeScopes(String(form.get("scope") || ""));

  const client = clientId ? await prisma.oAuthClient.findUnique({ where: { clientId } }) : null;
  if (!client || !client.redirectUris.includes(redirectUri)) {
    return NextResponse.json({ error: "invalid_client", error_description: "OAuth-Client ist ungueltig." }, { status: 400 });
  }
  if (!isAllowedOAuthResource(resource)) {
    return redirectWithOAuthError(redirectUri, state, "invalid_target", "resource passt nicht zu diesem MCP-Server.");
  }
  const resourceTarget = await resolveOAuthResourceTarget(resource, user);
  if (!resourceTarget.ok) {
    return redirectWithOAuthError(redirectUri, state, "access_denied", resourceTarget.error);
  }
  if (codeChallengeMethod !== "S256" || !codeChallenge) {
    return redirectWithOAuthError(redirectUri, state, "invalid_request", "PKCE S256 ist erforderlich.");
  }
  if (decision !== "allow") {
    return redirectWithOAuthError(redirectUri, state, "access_denied", "Zugriff wurde abgelehnt.");
  }

  const code = createOAuthSecret("immo_oauth_code_");
  await prisma.oAuthAuthorizationCode.create({
    data: {
      codeHash: hashOAuthSecret(code),
      userId: resourceTarget.user.id,
      portalInstanceId: resourceTarget.user.portalInstanceId,
      clientId,
      redirectUri,
      scopes,
      codeChallenge,
      codeChallengeMethod,
      resource: resourceTarget.resource,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    }
  });

  const target = new URL(redirectUri);
  target.searchParams.set("code", code);
  if (state) target.searchParams.set("state", state);
  return NextResponse.redirect(target, 303);
}
