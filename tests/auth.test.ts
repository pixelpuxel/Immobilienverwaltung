import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import { createSessionToken, readSessionToken } from "@/lib/auth";

describe("auth sessions", () => {
  it("creates and verifies a signed session token", () => {
    const token = createSessionToken({ id: "user_1", email: "admin@example.test", role: Role.ADMIN });
    const session = readSessionToken(token);
    expect(session?.userId).toBe("user_1");
    expect(session?.role).toBe(Role.ADMIN);
  });

  it("rejects tampered tokens", () => {
    const token = createSessionToken({ id: "user_1", email: "admin@example.test", role: Role.ADMIN });
    expect(readSessionToken(`${token}x`)).toBeNull();
  });
});
