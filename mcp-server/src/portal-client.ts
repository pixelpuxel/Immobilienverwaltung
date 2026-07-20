import { McpConfig } from "./config.js";

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type PortalRequest = {
  method?: HttpMethod;
  path: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
};

export class PortalClient {
  constructor(private readonly config: McpConfig) {}

  buildPortalUrl(path: string, query?: PortalRequest["query"]) {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(normalizedPath, this.config.portalBaseUrl);
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
    return url;
  }

  buildPublicUrl(path: string) {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return new URL(normalizedPath, this.config.publicBaseUrl).toString();
  }

  async json<T = unknown>(request: PortalRequest): Promise<T> {
    if (!this.config.portalToken) {
      throw new PortalApiError(
        500,
        "MCP_PORTAL_TOKEN fehlt. Bitte im Portal einen API-Token mit passenden Scopes erzeugen und in .env setzen.",
        { code: "MISSING_PORTAL_TOKEN" }
      );
    }
    const response = await fetch(this.buildPortalUrl(request.path, request.query), {
      method: request.method || "GET",
      headers: {
        Authorization: `Bearer ${this.config.portalToken}`,
        Accept: "application/json",
        ...(request.body === undefined ? {} : { "Content-Type": "application/json" })
      },
      body: request.body === undefined ? undefined : JSON.stringify(request.body)
    });

    const text = await response.text();
    const parsed = parseJson(text);
    if (!response.ok) {
      const message = errorMessage(parsed) || text || `${response.status} ${response.statusText}`;
      throw new PortalApiError(response.status, message, parsed);
    }
    return parsed as T;
  }

  integrationUrl(path: string, query?: PortalRequest["query"]) {
    return this.buildPortalUrl(path, query).toString();
  }
}

export class PortalApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details: unknown
  ) {
    super(message);
  }
}

function parseJson(text: string) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function errorMessage(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const object = value as { error?: { message?: unknown }; message?: unknown };
  return typeof object.error?.message === "string"
    ? object.error.message
    : typeof object.message === "string"
      ? object.message
      : null;
}
