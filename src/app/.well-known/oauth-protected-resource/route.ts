import { NextResponse } from "next/server";
import { oauthIssuer, oauthResource, OAUTH_SUPPORTED_SCOPES } from "@/lib/oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    resource: oauthResource(),
    authorization_servers: [oauthIssuer()],
    scopes_supported: OAUTH_SUPPORTED_SCOPES,
    bearer_methods_supported: ["header"],
    resource_documentation: `${oauthIssuer()}/settings`
  });
}
