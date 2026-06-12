import { Role, type User } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import { env, isProductionUrl } from "./env";
import { prisma } from "./prisma";

export const SESSION_COOKIE = "portal_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;
export const REMEMBERED_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

type SessionPayload = {
  userId: string;
  email: string;
  role: Role;
  portalInstanceId?: string | null;
  platformAdmin?: boolean;
  exp: number;
  impersonatedByAdminId?: string;
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

function base64url(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

function sign(data: string) {
  return crypto.createHmac("sha256", env.jwtSecret).update(data).digest("base64url");
}

export function createSessionToken(user: Pick<User, "id" | "email" | "role" | "portalInstanceId" | "platformAdmin">, options?: { impersonatedByAdminId?: string | null; maxAgeSeconds?: number }) {
  const maxAgeSeconds = options?.maxAgeSeconds || SESSION_TTL_SECONDS;
  const payload: SessionPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    portalInstanceId: user.portalInstanceId,
    platformAdmin: user.platformAdmin,
    exp: Math.floor(Date.now() / 1000) + maxAgeSeconds
  };
  if (options?.impersonatedByAdminId) payload.impersonatedByAdminId = options.impersonatedByAdminId;
  const body = base64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function readSessionToken(token?: string | null): SessionPayload | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature || sign(body) !== signature) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function setSessionCookie(response: NextResponse, token: string, options?: { maxAgeSeconds?: number }) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProductionUrl(),
    path: "/",
    maxAge: options?.maxAgeSeconds || SESSION_TTL_SECONDS
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isProductionUrl(),
    path: "/",
    maxAge: 0
  });
}

export async function currentUser() {
  const session = readSessionToken(cookies().get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const user = await prisma.user.findFirst({
    where: { id: session.userId, active: true },
    select: { id: true, email: true, username: true, name: true, role: true, active: true, portalInstanceId: true, platformAdmin: true }
  });
  return user ? { ...user, impersonatedByAdminId: session.impersonatedByAdminId ?? null } : null;
}

export async function requireUser(roles?: Role[]) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (roles?.length && !roles.includes(user.role)) redirect("/dashboard");
  return user;
}

export async function requireApiUser(request: NextRequest, roles?: Role[]) {
  const session = readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const user = await prisma.user.findFirst({ where: { id: session.userId, active: true } });
  if (!user) return null;
  if (roles?.length && !roles.includes(user.role)) return null;
  return user;
}

export function assertSameOrigin(request: NextRequest) {
  if (request.method === "GET" || request.method === "HEAD") return true;
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function clientIp(request?: NextRequest) {
  if (request) {
    return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  }
  const h = headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
