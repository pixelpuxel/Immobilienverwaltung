export type McpConfig = {
  name: string;
  version: string;
  port: number;
  publicBaseUrl: string;
  portalBaseUrl: string;
  jsonLimit: string;
};

export function readConfig(): McpConfig {
  const portalBaseUrl = requiredEnv("MCP_PORTAL_BASE_URL").replace(/\/+$/, "");
  return {
    name: process.env.MCP_SERVER_NAME || "Immobilienportal MCP",
    version: process.env.MCP_SERVER_VERSION || "0.1.0",
    port: Number(process.env.MCP_PORT || "8090"),
    publicBaseUrl: (process.env.MCP_PUBLIC_BASE_URL || "http://localhost:8090").replace(/\/+$/, ""),
    portalBaseUrl,
    jsonLimit: process.env.MCP_JSON_LIMIT || "120mb"
  };
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}
