import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createOAuthSecret } from "@/lib/oauth";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const redirectUris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.map((uri: unknown) => String(uri || "").trim()).filter(Boolean)
    : [];
  if (!redirectUris.length) {
    return NextResponse.json({ error: "invalid_redirect_uri", error_description: "redirect_uris ist erforderlich." }, { status: 400 });
  }
  if (!redirectUris.every((uri: string) => isSafeRedirectUri(uri))) {
    return NextResponse.json({ error: "invalid_redirect_uri", error_description: "Redirect-URI ist nicht erlaubt." }, { status: 400 });
  }

  const tokenEndpointAuthMethod = String(body.token_endpoint_auth_method || "none");
  if (tokenEndpointAuthMethod !== "none") {
    return NextResponse.json({ error: "invalid_client_metadata", error_description: "Nur token_endpoint_auth_method=none wird unterstuetzt." }, { status: 400 });
  }

  const client = await prisma.oAuthClient.create({
    data: {
      clientId: createOAuthSecret("immo_oauth_client_"),
      clientName: String(body.client_name || body.application_name || "OAuth-Client").slice(0, 160),
      redirectUris,
      clientUri: body.client_uri ? String(body.client_uri).slice(0, 500) : null,
      logoUri: body.logo_uri ? String(body.logo_uri).slice(0, 500) : null
    }
  });

  return NextResponse.json(
    {
      client_id: client.clientId,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none"
    },
    { status: 201 }
  );
}

function isSafeRedirectUri(value: string) {
  if (value === "de.schreiber.mcpexplorer.oauth://callback") return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}
