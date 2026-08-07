import crypto from "crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export const OAUTH_SUPPORTED_SCOPES = [
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
];

export const DEFAULT_MCP_SCOPES = [
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
];

export function oauthIssuer() {
  return stripTrailingSlash(env.appUrl);
}

export function oauthResource(profile?: string | null) {
  const suffix = normalizeResourceProfile(profile);
  return suffix ? `${oauthIssuer()}/mcp/${encodeURIComponent(suffix)}` : `${oauthIssuer()}/mcp`;
}

export function normalizeResourceProfile(profile?: string | null) {
  const value = String(profile || "").trim().replace(/^@+/, "").toLowerCase();
  if (!value) return "";
  return /^[a-z0-9._-]{1,80}$/.test(value) ? value : "";
}

export function parseOAuthResource(resource: string) {
  try {
    const issuer = new URL(oauthIssuer());
    const url = new URL(resource);
    if (url.origin !== issuer.origin) return null;
    const path = url.pathname.replace(/\/+$/, "");
    if (path === "/mcp") return { resource: oauthResource(), profile: "" };
    const match = path.match(/^\/mcp\/([^/]+)$/);
    if (!match) return null;
    const decodedProfile = normalizeResourceProfile(decodeURIComponent(match[1]));
    if (!decodedProfile) return null;
    return { resource: oauthResource(decodedProfile), profile: decodedProfile };
  } catch {
    return null;
  }
}

export function isAllowedOAuthResource(resource: string) {
  return Boolean(parseOAuthResource(resource));
}

export function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export function normalizeScopes(scope?: string | null) {
  const requested = String(scope || "")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const accepted = requested.filter((item) => OAUTH_SUPPORTED_SCOPES.includes(item));
  return accepted.length ? [...new Set(accepted)] : DEFAULT_MCP_SCOPES;
}

export function createOAuthSecret(prefix = "") {
  return `${prefix}${crypto.randomBytes(32).toString("base64url")}`;
}

export function hashOAuthSecret(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function verifyPkce(codeVerifier: string, codeChallenge: string, method: string) {
  if (method !== "S256") return false;
  const expected = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  return timingSafeEqual(expected, codeChallenge);
}

export function timingSafeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function oauthError(error: string, errorDescription: string, status = 400) {
  return NextResponse.json({ error, error_description: errorDescription }, { status });
}

export function redirectWithOAuthError(redirectUri: string, state: string | null, error: string, description: string) {
  const target = new URL(redirectUri);
  target.searchParams.set("error", error);
  target.searchParams.set("error_description", description);
  if (state) target.searchParams.set("state", state);
  return NextResponse.redirect(target, 303);
}

export function safeInternalNextPath(value?: string | string[] | null) {
  const next = Array.isArray(value) ? value[0] : value;
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

export function isChatGptClientUrl(clientId: string) {
  try {
    const url = new URL(clientId);
    return ["chatgpt.com", "chat.openai.com"].includes(url.hostname);
  } catch {
    return false;
  }
}

export function isAllowedChatGptRedirect(redirectUri: string) {
  try {
    const url = new URL(redirectUri);
    return url.protocol === "https:" && ["chatgpt.com", "chat.openai.com"].includes(url.hostname);
  } catch {
    return false;
  }
}

export function clientDisplayName(clientName: string | null | undefined, clientId: string) {
  if (clientName) return clientName;
  if (isChatGptClientUrl(clientId)) return "ChatGPT";
  return clientId;
}
