import { describe, expect, it } from "vitest";
import { allowedExtensions, safeFilename } from "@/lib/files";

describe("upload API constraints", () => {
  it("allows office, pdf and image documents", () => {
    expect(allowedExtensions.has(".pdf")).toBe(true);
    expect(allowedExtensions.has(".docx")).toBe(true);
    expect(allowedExtensions.has(".png")).toBe(true);
  });

  it("normalizes unsafe file names", () => {
    expect(safeFilename("../../grundbuch auszug.pdf")).toBe("..-..-grundbuch-auszug.pdf");
  });
});
