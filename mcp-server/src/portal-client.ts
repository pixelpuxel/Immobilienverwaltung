import { McpConfig } from "./config.js";

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type PortalRequest = {
  method?: HttpMethod;
  path: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
};

export type PortalFileResponse = {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  size: number;
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

  async file(request: Pick<PortalRequest, "path" | "query">): Promise<PortalFileResponse> {
    const response = await fetch(this.buildPortalUrl(request.path, request.query), {
      method: "GET",
      headers: {
        ...(this.portalToken ? { Authorization: `Bearer ${this.portalToken}` } : {}),
        Accept: "application/octet-stream,application/pdf,*/*"
      }
    });

    if (!response.ok) {
      const text = await response.text();
      const parsed = parseJson(text);
      const message = errorMessage(parsed) || text || `${response.status} ${response.statusText}`;
      throw new PortalApiError(response.status, message, parsed);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentDisposition = response.headers.get("content-disposition") || "";
    return {
      buffer,
      filename: filenameFromContentDisposition(contentDisposition) || "document",
      mimeType: response.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream",
      size: buffer.length
    };
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

function filenameFromContentDisposition(value: string) {
  const encoded = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }
  const plain = value.match(/filename="?([^";]+)"?/i)?.[1];
  if (!plain) return null;
  try {
    return decodeURIComponent(plain);
  } catch {
    return plain;
  }
}
