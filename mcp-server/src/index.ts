import { randomUUID } from "crypto";
import express, { type Request, type Response, type NextFunction } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { readConfig } from "./config.js";
import { PortalClient } from "./portal-client.js";
import { registerPortalTools } from "./tools.js";

const config = readConfig();
const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "8mb" }));

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

app.get("/.well-known/oauth-protected-resource", (_request, response) => {
  response.json({
    resource: `${config.publicBaseUrl}/mcp`,
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
  });
});

const mcpPaths = ["/mcp", "/mcp/:profile"];

app.post(mcpPaths, requireMcpClientToken, async (request, response) => {
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

app.get(mcpPaths, requireMcpClientToken, (_request, response) => {
  response.status(405).json({
    error: "This MCP server uses stateless Streamable HTTP. Send JSON-RPC requests with POST /mcp."
  });
});

app.delete(mcpPaths, requireMcpClientToken, (_request, response) => {
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
  const token = bearerToken(request);
  if (!token) {
    setOAuthChallenge(response);
    response.status(401).json({
      error: "UNAUTHORIZED",
      message: "Bearer token missing. Start the OAuth flow or use a Portal API token created in the backend."
    });
    return;
  }
  try {
    await new PortalClient(config, token).json({ path: "/api/integrations/v1/me" });
    next();
  } catch (error) {
    setOAuthChallenge(response);
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

function setOAuthChallenge(response: Response) {
  const resourceMetadata = `${config.publicBaseUrl}/.well-known/oauth-protected-resource`;
  response.setHeader("WWW-Authenticate", `Bearer resource_metadata="${resourceMetadata}"`);
}
