export const env = {
  appUrl: process.env.APP_URL || "http://localhost:8088",
  trustProxy: process.env.TRUST_PROXY === "true",
  jwtSecret: process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || "bitte_aendern",
  uploadPath: process.env.UPLOAD_PATH || "/app/uploads",
  contractsPath: process.env.CONTRACTS_PATH || "/app/contracts",
  rateLimitWindowSeconds: Number(process.env.RATE_LIMIT_WINDOW_SECONDS || 60),
  rateLimitMaxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 120)
};

export function isProductionUrl() {
  return env.appUrl.startsWith("https://");
}
