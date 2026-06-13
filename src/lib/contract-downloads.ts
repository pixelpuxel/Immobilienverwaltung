import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import type { LeaseContract } from "@prisma/client";
import { env } from "./env";

export type ContractDownloadFormat = "docx" | "pdf";

export function buildContractDownloadUrl(contractId: string, format: ContractDownloadFormat, options?: { absolute?: boolean; signed?: boolean; expiresInSeconds?: number }) {
  const base = options?.absolute ? env.appUrl.replace(/\/$/, "") : "";
  const url = new URL(`${base || "http://local"}/api/contracts/${contractId}/download`);
  url.searchParams.set("format", format);
  if (options?.signed) {
    const expiresAt = Math.floor(Date.now() / 1000) + (options.expiresInSeconds || 3600);
    url.searchParams.set("expires", String(expiresAt));
    url.searchParams.set("token", signContractDownload(contractId, format, expiresAt));
  }
  const value = `${url.pathname}${url.search}`;
  return options?.absolute ? `${base}${value}` : value;
}

export function buildContractPreviewUrl(contractId: string, options?: { absolute?: boolean; signed?: boolean; expiresInSeconds?: number }) {
  const base = options?.absolute ? env.appUrl.replace(/\/$/, "") : "";
  const url = new URL(`${base || "http://local"}/api/contracts/${contractId}/preview`);
  if (options?.signed) {
    const expiresAt = Math.floor(Date.now() / 1000) + (options.expiresInSeconds || 3600);
    url.searchParams.set("expires", String(expiresAt));
    url.searchParams.set("token", signContractDownload(contractId, "pdf", expiresAt, "preview"));
  }
  const value = `${url.pathname}${url.search}`;
  return options?.absolute ? `${base}${value}` : value;
}

export function verifyContractDownloadToken(contractId: string, format: ContractDownloadFormat, expires: string | null, token: string | null, purpose: "download" | "preview" = "download") {
  if (!expires || !token) return false;
  const expiresAt = Number(expires);
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return false;
  const expected = signContractDownload(contractId, format, expiresAt, purpose);
  const expectedBuffer = Buffer.from(expected);
  const tokenBuffer = Buffer.from(token);
  return expectedBuffer.length === tokenBuffer.length && crypto.timingSafeEqual(expectedBuffer, tokenBuffer);
}

export async function checkedContractFiles(paths: { docxPath: string; pdfPath?: string | null }) {
  const docx = await readableContractFile(paths.docxPath);
  const pdf = paths.pdfPath ? await readableContractFile(paths.pdfPath).catch(() => null) : null;
  return { docxPath: docx, pdfPath: pdf };
}

export function contractPublicLinks(contractId: string, hasPdf: boolean, options?: { absolute?: boolean; signed?: boolean; expiresInSeconds?: number }) {
  return {
    preview: buildContractPreviewUrl(contractId, options),
    docx: buildContractDownloadUrl(contractId, "docx", options),
    pdf: hasPdf ? buildContractDownloadUrl(contractId, "pdf", options) : null
  };
}

export function bestContractAttachment(contract: Pick<LeaseContract, "docxPath" | "pdfPath">, filenameBase: string) {
  if (contract.pdfPath) return { path: contract.pdfPath, filename: `${safeAttachmentName(filenameBase)}.pdf`, format: "pdf" as const };
  return { path: contract.docxPath, filename: `${safeAttachmentName(filenameBase)}.docx`, format: "docx" as const };
}

async function readableContractFile(filePath: string) {
  const resolved = path.resolve(filePath);
  const root = path.resolve(env.contractsPath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Ungueltiger Vertragspfad.");
  }
  const stat = await fs.stat(resolved);
  if (!stat.isFile() || stat.size <= 0) throw new Error("Vertragsdatei ist leer oder nicht lesbar.");
  return resolved;
}

function signContractDownload(contractId: string, format: ContractDownloadFormat, expiresAt: number, purpose: "download" | "preview" = "download") {
  return crypto
    .createHmac("sha256", env.jwtSecret)
    .update([purpose, contractId, format, expiresAt].join(":"))
    .digest("base64url");
}

function safeAttachmentName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "mietvertrag";
}
