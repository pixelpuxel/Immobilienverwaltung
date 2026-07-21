import { NextResponse } from "next/server";
import { oauthIssuer, OAUTH_SUPPORTED_SCOPES } from "@/lib/oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  const issuer = oauthIssuer();
  return NextResponse.json({
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    client_id_metadata_document_supported: true,
    scopes_supported: OAUTH_SUPPORTED_SCOPES
  });
}
