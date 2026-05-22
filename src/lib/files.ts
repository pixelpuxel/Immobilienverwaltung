import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { env } from "./env";

export const allowedExtensions = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".jpg",
  ".jpeg",
  ".png",
  ".txt"
]);

export function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "datei";
}

export function validateUpload(file: File) {
  const ext = path.extname(file.name).toLowerCase();
  if (!allowedExtensions.has(ext)) {
    throw new Error("Dateityp ist nicht erlaubt.");
  }
  if (file.size > 100 * 1024 * 1024) {
    throw new Error("Datei ist zu gross. Maximal erlaubt sind 100 MB.");
  }
}

export async function saveUpload(file: File, folder = env.uploadPath) {
  validateUpload(file);
  await fs.mkdir(folder, { recursive: true });
  const filename = `${Date.now()}-${crypto.randomUUID()}-${safeFilename(file.name)}`;
  const storagePath = path.join(folder, filename);
  const bytes = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(storagePath, bytes, { flag: "wx" });
  return { storagePath, filename: file.name, mimeType: file.type || "application/octet-stream", size: file.size };
}

export async function readPrivateFile(storagePath: string) {
  const resolved = path.resolve(storagePath);
  const roots = [path.resolve(env.uploadPath), path.resolve(env.contractsPath)];
  if (!roots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`))) {
    throw new Error("Ungueltiger Dateipfad.");
  }
  return fs.readFile(resolved);
}
