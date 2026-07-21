import { McpConfig } from "./config.js";

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type PortalRequest = {
  method?: HttpMethod;
  path: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
};

export class PortalClient {
  constructor(
    private readonly config: McpConfig,
    private readonly portalToken = ""
  ) {}

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

  buildPublicUrl(path: string, query?: PortalRequest["query"]) {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(normalizedPath, this.config.publicBaseUrl);
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  async json<T = unknown>(request: PortalRequest): Promise<T> {
    const response = await fetch(this.buildPortalUrl(request.path, request.query), {
      method: request.method || "GET",
      headers: {
        ...(this.portalToken ? { Authorization: `Bearer ${this.portalToken}` } : {}),
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
    return this.buildPublicUrl(path, query);
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
