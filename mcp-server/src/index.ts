import { randomUUID } from "crypto";
import express, { type Request, type Response, type NextFunction } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { readConfig } from "./config.js";
import { PortalClient } from "./portal-client.js";
import { registerPortalTools } from "./tools.js";

const config = readConfig();
const app = express();
const MCP_ROUTES = ["/mcp", "/mcp/:profile"];

app.disable("x-powered-by");
app.use(express.json({ limit: config.jsonLimit }));

app.get("/health", async (_request, response) => {
  try {
    const portal = new PortalClient(config);
    const portalHealth = await portal.json({ path: "/api/integrations/v1/health" });
    response.json({
      ok: true,
      service: "immobilienportal-mcp",
      version: config.version,
      portal: portalHealth
    });
  } catch (error) {
    response.status(503).json({
      ok: false,
      service: "immobilienportal-mcp",
      error: error instanceof Error ? error.message : "Portal healthcheck failed"
    });
  }
});

app.get("/.well-known/oauth-protected-resource", (request, response) => {
  response.json(oauthProtectedResourceMetadata(routeProfile(request)));
});

app.get("/.well-known/oauth-protected-resource/:profile", (request, response) => {
  const profile = routeProfile(request);
  if (!profile) {
    response.status(404).json({ error: "invalid_resource" });
    return;
  }
  response.json(oauthProtectedResourceMetadata(profile));
});

app.post(MCP_ROUTES, requireMcpClientToken, async (request, response) => {
  const requestId = request.headers["x-request-id"]?.toString() || randomUUID();
  response.setHeader("X-Request-Id", requestId);

  const server = createMcpServer(new PortalClient(config, bearerToken(request)!));
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined
  });

  response.on("close", () => {
    transport.close().catch(() => undefined);
    server.close().catch(() => undefined);
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(request, response, request.body);
  } catch (error) {
    if (!response.headersSent) {
      response.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : "Internal MCP server error"
        },
        id: null
      });
    }
  }
});

app.get(MCP_ROUTES, requireMcpClientToken, (request, response) => {
  response.status(405).json({
    error: `This MCP server uses stateless Streamable HTTP. Send JSON-RPC requests with POST ${mcpPath(routeProfile(request))}.`
  });
});

app.delete(MCP_ROUTES, requireMcpClientToken, (_request, response) => {
  response.status(204).end();
});

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  response.status(500).json({
    ok: false,
    error: error instanceof Error ? error.message : "Internal server error"
  });
});

app.listen(config.port, "0.0.0.0", () => {
  console.log(`Immobilienportal MCP server listening on port ${config.port}`);
});

function createMcpServer(portal: PortalClient) {
  const server = new McpServer({
    name: config.name,
    version: config.version
  });

  registerPortalTools(server, portal);
  return server;
}

async function requireMcpClientToken(request: Request, response: Response, next: NextFunction) {
  const profile = routeProfile(request);
  const token = bearerToken(request);
  if (!token) {
    setOAuthChallenge(response, profile);
    response.status(401).json({
      error: "UNAUTHORIZED",
      message: "Bearer token missing. Start the OAuth flow or use a Portal API token created in the backend."
    });
    return;
  }
  try {
    const me = await new PortalClient(config, token).json({ path: "/api/integrations/v1/me" });
    if (profile && !profileMatchesUser(profile, me)) {
      setOAuthChallenge(response, profile);
      response.status(403).json({
        error: "FORBIDDEN",
        message: `Bearer token does not belong to the MCP route /mcp/${profile}. Reconnect this endpoint with the matching portal user.`
      });
      return;
    }
    next();
  } catch (error) {
    setOAuthChallenge(response, profile);
    response.status(401).json({
      error: "UNAUTHORIZED",
      message: error instanceof Error ? error.message : "Portal API token is invalid."
    });
  }
}

function bearerToken(request: Request) {
  const auth = request.headers.authorization || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function setOAuthChallenge(response: Response, profile?: string) {
  response.setHeader("WWW-Authenticate", `Bearer resource_metadata="${resourceMetadataUrl(profile)}"`);
}

function oauthProtectedResourceMetadata(profile?: string) {
  return {
    resource: resourceUrl(profile),
    authorization_servers: [config.publicBaseUrl],
    scopes_supported: [
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
      "read:timeline",
      "write:timeline",
      "write:landlord-confirmations",
      "write:settings",
      "backup:export",
      "backup:import",
      "read:audit"
    ],
    bearer_methods_supported: ["header"],
    resource_documentation: `${config.publicBaseUrl}/settings`
  };
}

function routeProfile(request: Request) {
  const raw = typeof request.params.profile === "string" ? request.params.profile : "";
  return normalizeProfile(raw);
}

function normalizeProfile(profile?: string | null) {
  const value = String(profile || "").trim().replace(/^@+/, "").toLowerCase();
  if (!value) return "";
  return /^[a-z0-9._-]{1,80}$/.test(value) ? value : "";
}

function mcpPath(profile?: string) {
  return profile ? `/mcp/${encodeURIComponent(profile)}` : "/mcp";
}

function resourceUrl(profile?: string) {
  return `${config.publicBaseUrl}${mcpPath(profile)}`;
}

function resourceMetadataUrl(profile?: string) {
  return profile ? `${config.publicBaseUrl}/.well-known/oauth-protected-resource/${encodeURIComponent(profile)}` : `${config.publicBaseUrl}/.well-known/oauth-protected-resource`;
}

function profileMatchesUser(profile: string, me: unknown) {
  const normalized = normalizeProfile(profile);
  if (!normalized) return false;
  const user = extractUser(me);
  return [user?.id, user?.username, user?.email]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .some((value) => normalizeProfile(value) === normalized || String(value).trim().toLowerCase() === normalized);
}

function extractUser(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const objectValue = value as { user?: unknown };
  const candidate = objectValue.user && typeof objectValue.user === "object" ? objectValue.user : value;
  return candidate as { id?: string; username?: string | null; email?: string | null };
}
