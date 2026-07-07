import type { Role, User } from "@prisma/client";

export function roleLabel(role: Role | "ADMIN" | "BROKER" | "TENANT" | "TAX_ADVISOR") {
  if (role === "ADMIN") return "Eigentümer";
  if (role === "BROKER") return "Makler";
  if (role === "TAX_ADVISOR") return "Steuerberater";
  return "Mieter";
}

export function userDisplayName(user: Pick<User, "email" | "username" | "name"> | { email: string; username?: string | null; name?: string | null }) {
  return user.name || user.username || user.email;
}
