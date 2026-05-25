import type { User } from "@prisma/client";

export function roleLabel(role: "ADMIN" | "BROKER" | "TENANT") {
  if (role === "ADMIN") return "Eigentümer";
  if (role === "BROKER") return "Makler";
  return "Mieter";
}

export function userDisplayName(user: Pick<User, "email" | "username" | "name"> | { email: string; username?: string | null; name?: string | null }) {
  return user.name || user.username || user.email;
}
