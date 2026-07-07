import crypto from "crypto";
import { env } from "./env";

export function createPublicShareSlug() {
  return crypto.randomBytes(24).toString("base64url");
}

export function publicShareUrl(slug: string) {
  return `${env.appUrl.replace(/\/$/, "")}/share/${slug}`;
}

export function isShareExpired(share: { expiresAt: Date | null; revokedAt?: Date | null }) {
  return Boolean(share.revokedAt || (share.expiresAt && share.expiresAt.getTime() < Date.now()));
}
