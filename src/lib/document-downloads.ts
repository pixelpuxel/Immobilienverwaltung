import crypto from "crypto";
import { env } from "./env";
import { publicPortalBaseUrl } from "./public-shares";

export type DocumentFileKind = "download" | "preview" | "thumbnail";

export type DocumentSignedUrlOptions = {
  absolute?: boolean;
  signed?: boolean;
  expiresInSeconds?: number;
  expiresAtSeconds?: number;
};

const SIGNED_URL_CLOCK_TOLERANCE_SECONDS = 30;

export function buildDocumentFileUrl(documentId: string, kind: DocumentFileKind, options?: DocumentSignedUrlOptions) {
  const base = options?.absolute ? publicPortalBaseUrl() : "";
  const url = new URL(`${base || "http://local"}/api/documents/${documentId}/${kind}`);
  if (options?.signed) {
    const expiresAt = options.expiresAtSeconds ?? Math.floor(Date.now() / 1000) + (options.expiresInSeconds || 3600);
    url.searchParams.set("expires", String(expiresAt));
    url.searchParams.set("token", signDocumentFileUrl(documentId, kind, expiresAt));
  }
  const value = `${url.pathname}${url.search}`;
  return options?.absolute ? `${base}${value}` : value;
}

export function documentPublicLinks(documentId: string, options?: DocumentSignedUrlOptions) {
  return {
    preview: buildDocumentFileUrl(documentId, "preview", options),
    download: buildDocumentFileUrl(documentId, "download", options),
    thumbnail: buildDocumentFileUrl(documentId, "thumbnail", options)
  };
}

export function verifyDocumentFileToken(documentId: string, kind: DocumentFileKind, expires: string | null, token: string | null) {
  if (!expires || !token) return false;
  const expiresAt = Number(expires);
  if (!Number.isFinite(expiresAt) || expiresAt + SIGNED_URL_CLOCK_TOLERANCE_SECONDS < Math.floor(Date.now() / 1000)) return false;
  const expected = signDocumentFileUrl(documentId, kind, expiresAt);
  const expectedBuffer = Buffer.from(expected);
  const tokenBuffer = Buffer.from(token);
  return expectedBuffer.length === tokenBuffer.length && crypto.timingSafeEqual(expectedBuffer, tokenBuffer);
}

function signDocumentFileUrl(documentId: string, kind: DocumentFileKind, expiresAt: number) {
  return crypto
    .createHmac("sha256", env.jwtSecret)
    .update(["document", kind, documentId, expiresAt].join(":"))
    .digest("base64url");
}
