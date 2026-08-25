import { afterEach, describe, expect, it } from "vitest";
import { buildDocumentFileUrl } from "../src/lib/document-downloads";
import { publicShareUrl } from "../src/lib/public-shares";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("publicShareUrl", () => {
  it("uses PUBLIC_APP_URL for public share links", () => {
    process.env.PUBLIC_APP_URL = "https://example.test/";
    process.env.APP_URL = "http://192.168.0.180:8088";
    expect(publicShareUrl("slug-123")).toBe("https://example.test/share/slug-123");
  });

  it("rejects private APP_URL values", () => {
    delete process.env.PUBLIC_APP_URL;
    delete process.env.APP_PUBLIC_URL;
    delete process.env.MCP_PUBLIC_BASE_URL;
    process.env.APP_URL = "http://192.168.0.180:8088";
    expect(() => publicShareUrl("slug-123")).toThrow("Keine öffentliche Portal-URL konfiguriert. Setze PUBLIC_APP_URL.");
  });

  it("uses the validated public portal URL for absolute document links", () => {
    process.env.PUBLIC_APP_URL = "https://example.test";
    process.env.APP_URL = "http://192.168.1.25:8088";

    expect(buildDocumentFileUrl("document-1", "download", { absolute: true }))
      .toBe("https://example.test/api/documents/document-1/download");
  });
});
