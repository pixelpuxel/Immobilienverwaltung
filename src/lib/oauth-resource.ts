import type { User } from "@prisma/client";
import { normalizeResourceProfile, parseOAuthResource } from "@/lib/oauth";
import { prisma } from "@/lib/prisma";

export type OAuthResourceTarget = {
  ok: true;
  resource: string;
  profile: string;
  user: User;
} | {
  ok: false;
  error: string;
};

export async function resolveOAuthResourceTarget(resource: string, actor: Pick<User, "id" | "platformAdmin">): Promise<OAuthResourceTarget> {
  const parsed = parseOAuthResource(resource);
  if (!parsed) return { ok: false, error: "resource passt nicht zu diesem MCP-Server." };
  if (!parsed.profile) {
    const user = await prisma.user.findFirst({ where: { id: actor.id, active: true } });
    return user ? { ok: true, resource: parsed.resource, profile: "", user } : { ok: false, error: "Benutzer wurde nicht gefunden." };
  }

  const profile = normalizeResourceProfile(parsed.profile);
  const users = await prisma.user.findMany({
    where: {
      active: true,
      OR: [
        { id: profile },
        { username: { equals: profile, mode: "insensitive" } },
        { email: { equals: profile, mode: "insensitive" } }
      ]
    },
    take: 2
  });
  if (users.length === 0) return { ok: false, error: `Benutzerkennung "${profile}" wurde nicht gefunden.` };
  if (users.length > 1) return { ok: false, error: `Benutzerkennung "${profile}" ist nicht eindeutig. Bitte Benutzername oder E-Mail eindeutig setzen.` };
  const target = users[0];
  if (target.id !== actor.id && !actor.platformAdmin) {
    return { ok: false, error: "Diese MCP-Route darf nur vom Zielbenutzer oder einem Plattform-Admin verbunden werden." };
  }
  return { ok: true, resource: parsed.resource, profile, user: target };
}
