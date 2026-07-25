import { NextResponse } from "next/server";

const IOS_APP_ID = "TVU2AD92HJ.de.schreiber.mcpexplorer";

export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(
    {
      webcredentials: {
        apps: [IOS_APP_ID]
      },
      applinks: {
        details: [
          {
            appIDs: [IOS_APP_ID],
            components: [
              {
                "/": "/oauth/ios/callback",
                comment: "MCP Explorer OAuth callback"
              }
            ]
          }
        ]
      }
    },
    {
      headers: {
        "Cache-Control": "public, max-age=3600"
      }
    }
  );
}
