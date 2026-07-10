import crypto from "crypto";
import http2 from "http2";
import { env } from "./env";

type ApnsPayload = {
  aps: {
    alert: {
      title: string;
      body: string;
    };
    sound?: string;
    badge?: number;
  };
  targetType?: string;
  targetId?: string;
  targetTitle?: string;
};

export type ApnsSendResult = {
  ok: boolean;
  status: number;
  apnsId?: string;
  reason?: string;
};

export function apnsConfigured() {
  return Boolean(env.apnsTeamId && env.apnsKeyId && env.apnsBundleId && env.apnsPrivateKey);
}

export async function sendApnsPush(input: {
  deviceToken: string;
  environment: string;
  payload: ApnsPayload;
}) {
  if (!apnsConfigured()) {
    throw new Error("APNs ist nicht konfiguriert. Benoetigt: APNS_TEAM_ID, APNS_KEY_ID, APNS_BUNDLE_ID, APNS_PRIVATE_KEY.");
  }

  const host = apnsHost(input.environment);
  const client = http2.connect(`https://${host}`);
  const token = apnsJwt();

  return await new Promise<ApnsSendResult>((resolve, reject) => {
    client.once("error", reject);

    const request = client.request({
      ":method": "POST",
      ":path": `/3/device/${input.deviceToken}`,
      authorization: `bearer ${token}`,
      "apns-topic": env.apnsBundleId,
      "apns-push-type": "alert",
      "apns-priority": "10"
    });

    let responseBody = "";
    let status = 0;
    let apnsId: string | undefined;

    request.setEncoding("utf8");
    request.on("response", (headers) => {
      status = Number(headers[":status"] || 0);
      const headerApnsId = headers["apns-id"];
      apnsId = Array.isArray(headerApnsId) ? headerApnsId[0] : headerApnsId;
    });
    request.on("data", (chunk) => {
      responseBody += chunk;
    });
    request.on("end", () => {
      client.close();
      const reason = responseBody ? parseApnsReason(responseBody) : undefined;
      resolve({ ok: status >= 200 && status < 300, status, apnsId, reason });
    });
    request.on("error", (error) => {
      client.close();
      reject(error);
    });
    request.end(JSON.stringify(input.payload));
  });
}

function apnsHost(deviceEnvironment: string) {
  const configured = env.apnsEnvironment.toLowerCase();
  if (configured === "sandbox" || configured === "development") return "api.sandbox.push.apple.com";
  if (configured === "production") return "api.push.apple.com";
  return deviceEnvironment === "development" ? "api.sandbox.push.apple.com" : "api.push.apple.com";
}

function apnsJwt() {
  const header = base64url(JSON.stringify({ alg: "ES256", kid: env.apnsKeyId }));
  const payload = base64url(JSON.stringify({ iss: env.apnsTeamId, iat: Math.floor(Date.now() / 1000) }));
  const signingInput = `${header}.${payload}`;
  const signature = crypto.sign("sha256", Buffer.from(signingInput), {
    key: env.apnsPrivateKey,
    dsaEncoding: "ieee-p1363"
  }).toString("base64url");
  return `${signingInput}.${signature}`;
}

function base64url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function parseApnsReason(body: string) {
  try {
    return JSON.parse(body).reason as string | undefined;
  } catch {
    return body;
  }
}
