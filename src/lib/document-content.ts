import { execFile } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";

import { readPrivateFile } from "@/lib/files";

const execFileAsync = promisify(execFile);

export type DocumentContentResult = {
  documentId: string;
  filename: string;
  mimeType: string;
  size: number;
  extractionStatus: "TEXT_EXTRACTED" | "NO_TEXT_RETURN_FILE" | "UNSUPPORTED_RETURN_FILE" | "EXTRACTION_FAILED_RETURN_FILE";
  text: string;
  textTruncated: boolean;
  note: string | null;
  returnedFile: {
    filename: string;
    mimeType: string;
    encoding: "base64";
    base64: string;
  } | null;
};

export type ReadDocumentContentInput = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  storagePath: string;
  includeFile?: boolean;
  preferPdf?: boolean;
  maxChars?: number;
};

const DEFAULT_MAX_CHARS = 200_000;
const MAX_INLINE_FILE_BYTES = 15 * 1024 * 1024;

export async function readDocumentContent(input: ReadDocumentContentInput): Promise<DocumentContentResult> {
  const maxChars = Math.max(1_000, Math.min(500_000, input.maxChars || DEFAULT_MAX_CHARS));
  const mimeType = normalizeMimeType(input.mimeType, input.filename);
  let text = "";
  let extractionStatus: DocumentContentResult["extractionStatus"] = "UNSUPPORTED_RETURN_FILE";
  let note: string | null = null;

  try {
    if (isPlainText(mimeType, input.filename)) {
      text = (await readPrivateFile(input.storagePath)).toString("utf8");
      extractionStatus = "TEXT_EXTRACTED";
    } else if (mimeType === "application/pdf") {
      text = await extractPdfText(input.storagePath);
      extractionStatus = text.trim() ? "TEXT_EXTRACTED" : "NO_TEXT_RETURN_FILE";
      if (!text.trim()) note = "PDF enthaelt keinen maschinenlesbaren Text. Keine serverseitige OCR: Original-PDF wird fuer die Analyse durch den MCP-Client/LLM bereitgestellt.";
    } else if (isWordDocument(mimeType, input.filename)) {
      text = await extractOfficeText(input.storagePath, input.filename);
      extractionStatus = text.trim() ? "TEXT_EXTRACTED" : "NO_TEXT_RETURN_FILE";
      if (!text.trim()) note = "Dokument konnte nicht als Text extrahiert werden. Datei wird fuer die Analyse durch den MCP-Client/LLM bereitgestellt.";
    } else {
      note = "Dateityp wird nicht als Text extrahiert. Datei wird fuer die Analyse durch den MCP-Client/LLM bereitgestellt.";
    }
  } catch (error) {
    extractionStatus = "EXTRACTION_FAILED_RETURN_FILE";
    note = error instanceof Error ? `Textextraktion fehlgeschlagen: ${error.message}` : "Textextraktion fehlgeschlagen.";
  }

  const truncated = text.length > maxChars;
  const returnedFile = input.includeFile || extractionStatus !== "TEXT_EXTRACTED"
    ? await buildReturnedFile(input, mimeType)
    : null;

  return {
    documentId: input.id,
    filename: input.filename,
    mimeType,
    size: input.size,
    extractionStatus,
    text: truncated ? text.slice(0, maxChars) : text,
    textTruncated: truncated,
    note,
    returnedFile
  };
}

function normalizeMimeType(mimeType: string, filename: string) {
  const lower = filename.toLowerCase();
  if (mimeType && mimeType !== "application/octet-stream") return mimeType;
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "text/markdown";
  return mimeType || "application/octet-stream";
}

function isPlainText(mimeType: string, filename: string) {
  const lower = filename.toLowerCase();
  return mimeType.startsWith("text/") || lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".markdown");
}

function isWordDocument(mimeType: string, filename: string) {
  const lower = filename.toLowerCase();
  return mimeType === "application/msword" ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".doc") ||
    lower.endsWith(".docx");
}

async function extractPdfText(storagePath: string) {
  const { stdout } = await execFileAsync("pdftotext", ["-layout", storagePath, "-"], { timeout: 90_000, maxBuffer: 20 * 1024 * 1024 });
  return stdout;
}

async function extractOfficeText(storagePath: string, filename: string) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "immo-doc-text-"));
  try {
    await execFileAsync("libreoffice", ["--headless", "--convert-to", "txt:Text", "--outdir", tempDir, storagePath], { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 });
    const basename = path.basename(filename, path.extname(filename));
    const files = await fs.readdir(tempDir).catch(() => []);
    const candidates = [path.join(tempDir, `${basename}.txt`), ...files.filter((item) => item.toLowerCase().endsWith(".txt")).map((item) => path.join(tempDir, item))];
    for (const candidate of candidates) {
      try {
        return await fs.readFile(candidate, "utf8");
      } catch {
        // try next candidate
      }
    }
    return "";
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function buildReturnedFile(input: ReadDocumentContentInput, mimeType: string) {
  let buffer: Buffer;
  let filename = input.filename;
  let outputMimeType = mimeType;

  if (input.preferPdf && mimeType !== "application/pdf" && isWordDocument(mimeType, input.filename)) {
    const rendered = await renderOfficePdf(input.storagePath, input.filename).catch(() => null);
    if (rendered) {
      buffer = rendered;
      filename = `${path.basename(input.filename, path.extname(input.filename))}.pdf`;
      outputMimeType = "application/pdf";
    } else {
      buffer = await readPrivateFile(input.storagePath);
    }
  } else {
    buffer = await readPrivateFile(input.storagePath);
  }

  if (buffer.length > MAX_INLINE_FILE_BYTES) return null;
  return {
    filename,
    mimeType: outputMimeType,
    encoding: "base64" as const,
    base64: buffer.toString("base64")
  };
}

async function renderOfficePdf(storagePath: string, filename: string) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "immo-doc-pdf-"));
  try {
    await execFileAsync("libreoffice", ["--headless", "--convert-to", "pdf", "--outdir", tempDir, storagePath], { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 });
    const basename = path.basename(filename, path.extname(filename));
    const files = await fs.readdir(tempDir).catch(() => []);
    const candidates = [path.join(tempDir, `${basename}.pdf`), ...files.filter((item) => item.toLowerCase().endsWith(".pdf")).map((item) => path.join(tempDir, item))];
    for (const candidate of candidates) {
      try {
        return await fs.readFile(candidate);
      } catch {
        // try next candidate
      }
    }
    return null;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
