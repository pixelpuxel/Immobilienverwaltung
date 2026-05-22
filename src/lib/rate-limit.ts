import { env } from "./env";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function checkRateLimit(key: string) {
  const now = Date.now();
  const resetAt = now + env.rateLimitWindowSeconds * 1000;
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt });
    return true;
  }

  bucket.count += 1;
  return bucket.count <= env.rateLimitMaxRequests;
}
