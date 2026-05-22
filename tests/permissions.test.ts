import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";

describe("role model", () => {
  it("contains the required portal roles", () => {
    expect([Role.ADMIN, Role.BROKER, Role.TENANT]).toEqual(["ADMIN", "BROKER", "TENANT"]);
  });
});
