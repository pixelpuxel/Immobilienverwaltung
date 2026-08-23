import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { decodeBase64File, detectMimeType, resolveIntegrationUploadFile } from "../src/lib/integration-upload";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("resolveIntegrationUploadFile", () => {
  it("decodes Base64 without a data URL prefix", async () => {
    const upload = await resolveIntegrationUploadFile({
      data: { fileBase64: Buffer.from("%PDF test").toString("base64"), filename: "test.pdf" }
    });
    expect(upload.buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(upload.mimeType).toBe("application/pdf");
  });

  it("decodes Base64 data URLs", () => {
    expect(decodeBase64File("data:text/plain;base64,SGVsbG8=").toString()).toBe("Hello");
  });

  it("joins ordered Base64 chunks", async () => {
    const upload = await resolveIntegrationUploadFile({
      data: { fileBase64Chunks: ["UEsD", "BBQA"], filename: "test.zip" }
    });
    expect(upload.buffer.toString("hex")).toBe("504b03041400");
    expect(upload.mimeType).toBe("application/zip");
  });

  it("rejects client-local paths instead of reading them", async () => {
    await expect(resolveIntegrationUploadFile({
      data: { file: { path: "/mnt/data/test.pdf" }, filename: "test.pdf" }
    })).rejects.toThrow("Lokale Pfade des Clients werden nicht automatisch ins Portal übertragen");
  });

  it("rejects empty files", async () => {
    await expect(resolveIntegrationUploadFile({
      data: { fileBase64: "", filename: "empty.txt" }
    })).rejects.toThrow("fileBase64 ist leer");
  });

  it("rejects invalid Base64", async () => {
    await expect(resolveIntegrationUploadFile({
      data: { fileBase64: "%%%%", filename: "bad.pdf" }
    })).rejects.toThrow("fileBase64 ist ungueltig");
  });

  it("detects DOCX, JPG and ZIP signatures", () => {
    expect(detectMimeType(Buffer.from("504b0304", "hex"), "test.docx", "application/octet-stream")).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(detectMimeType(Buffer.from("ffd8ffee", "hex"), "test.jpg", "application/octet-stream")).toBe("image/jpeg");
    expect(detectMimeType(Buffer.from("504b0304", "hex"), "test.zip", "application/octet-stream")).toBe("application/zip");
  });

  it("rejects files over the limit", async () => {
    const tooLarge = Buffer.alloc(100 * 1024 * 1024 + 1).toString("base64");
    await expect(resolveIntegrationUploadFile({
      data: { fileBase64: tooLarge, filename: "large.txt" }
    })).rejects.toThrow("Datei ist zu gross");
  });

  it("does not treat arbitrary path fields as server-local files", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "immo-upload-test-"));
    tempDirs.push(dir);
    const localFile = path.join(dir, "server.txt");
    await writeFile(localFile, "server");
    await expect(resolveIntegrationUploadFile({
      data: { file: { path: localFile }, filename: "server.txt" }
    })).rejects.toThrow("Lokale Pfade des Clients werden nicht automatisch ins Portal übertragen");
  });
});
