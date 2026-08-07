import { NextRequest, NextResponse } from "next/server";
import { normalizeResourceProfile, oauthIssuer, oauthResource, OAUTH_SUPPORTED_SCOPES } from "@/lib/oauth";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: { profile: string } }) {
  const profile = normalizeResourceProfile(params.profile);
  if (!profile) return NextResponse.json({ error: "invalid_resource" }, { status: 404 });
  return NextResponse.json({
    resource: oauthResource(profile),
    authorization_servers: [oauthIssuer()],
    scopes_supported: OAUTH_SUPPORTED_SCOPES,
    bearer_methods_supported: ["header"],
    resource_documentation: `${oauthIssuer()}/settings`
  });
}
