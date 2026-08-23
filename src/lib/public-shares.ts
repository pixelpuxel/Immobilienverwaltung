import crypto from "crypto";

export function createPublicShareSlug() {
  return crypto.randomBytes(24).toString("base64url");
}

export function publicShareUrl(slug: string) {
  return `${publicPortalBaseUrl()}/share/${slug}`;
}

export function isShareExpired(share: { expiresAt: Date | null; revokedAt?: Date | null }) {
  return Boolean(share.revokedAt || (share.expiresAt && share.expiresAt.getTime() < Date.now()));
}

export function publicPortalBaseUrl() {
  const candidates = [
    process.env.PUBLIC_APP_URL,
    process.env.APP_PUBLIC_URL,
    process.env.MCP_PUBLIC_BASE_URL,
    isPublicHttpsUrl(process.env.APP_URL) ? process.env.APP_URL : null
  ];
  const value = candidates.map((candidate) => candidate?.trim()).find(Boolean);
  if (!value || !isPublicHttpsUrl(value)) {
    throw new Error("Keine öffentliche Portal-URL konfiguriert. Setze PUBLIC_APP_URL.");
  }
  return new URL(value).toString().replace(/\/+$/, "");
}

function isPublicHttpsUrl(value: string | null | undefined) {
  if (!value) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "app" || host === "portal.local") return false;
  if (host.startsWith("127.") || host.startsWith("10.") || host.startsWith("192.168.")) return false;
  const parts = host.split(".").map((part) => Number(part));
  if (parts.length === 4 && parts.every((part) => Number.isInteger(part))) {
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
  }
  return true;
}
