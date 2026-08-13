import crypto from "crypto";
import { execFile } from "child_process";
import { mkdir, readdir, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import { buildDocumentMetadata } from "@/lib/document-metadata";
import { readPrivateFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";

const execFileAsync = promisify(execFile);
const OCR_TIMEOUT_MS = 180_000;
const MAX_OCR_CHARS = 80_000;

type OcrDocument = {
  id: string;
  title: string;
  filename: string;
  mimeType: string;
  storagePath: string;
  ocrText?: string | null;
  ocrStatus?: string | null;
  property?: { name: string } | null;
  unit?: { unitNumber: string; property?: { name: string } | null } | null;
  category?: { group: string; name: string } | null;
  documentYear?: number | null;
  createdAt?: Date | string | null;
};

export function isOcrSupported(document: Pick<OcrDocument, "filename" | "mimeType">) {
  const extension = path.extname(document.filename || "").toLowerCase();
  const mimeType = document.mimeType || "";
  return mimeType === "application/pdf"
    || extension === ".pdf"
    || mimeType.startsWith("image/")
    || [".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"].includes(extension);
}

export async function runDocumentOcr(documentId: string) {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: { property: true, unit: { include: { property: true } }, category: true }
  });
  if (!document) throw new Error("Dokument wurde nicht gefunden.");
  if (!document.storagePath) throw new Error("Dokument hat keine gespeicherte Datei.");
  if (!isOcrSupported(document)) {
    const updated = await prisma.document.update({
      where: { id: document.id },
      data: {
        ocrStatus: "UNSUPPORTED",
        ocrError: "OCR wird nur fuer PDF- und Bilddateien unterstuetzt.",
        ocrProcessedAt: new Date()
      }
    });
    return { document: updated, text: "", status: "UNSUPPORTED" as const };
  }

  await prisma.document.update({
    where: { id: document.id },
    data: { ocrStatus: "PROCESSING", ocrError: null }
  });

  try {
    const text = await extractOcrText(document);
    const metadata = buildDocumentMetadata(document);
    const summary = buildOcrSummary(document, text, metadata.summary);
    const tags = Array.from(new Set([...(document.tags || []), ...metadata.tags, "OCR"].filter(Boolean)));
    const updated = await prisma.document.update({
      where: { id: document.id },
      data: {
        ocrText: text,
        ocrStatus: text.trim() ? "DONE" : "EMPTY",
        ocrProcessedAt: new Date(),
        ocrError: null,
        summary,
        tags
      }
    });
    return { document: updated, text, status: updated.ocrStatus || "DONE" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "OCR ist fehlgeschlagen.";
    const updated = await prisma.document.update({
      where: { id: document.id },
      data: {
        ocrStatus: "FAILED",
        ocrError: message.slice(0, 1000),
        ocrProcessedAt: new Date()
      }
    });
    return { document: updated, text: "", status: "FAILED" as const, error: message };
  }
}

async function extractOcrText(document: OcrDocument) {
  const body = await readPrivateFile(document.storagePath);
  const extension = path.extname(document.filename || "").toLowerCase();
  const tmpDir = path.join(os.tmpdir(), `ocr-${crypto.randomUUID()}`);
  await mkdir(tmpDir, { recursive: true });
  try {
    const inputPath = path.join(tmpDir, `input${extension || fileExtensionFor(document.mimeType)}`);
    await writeFile(inputPath, body);
    if (document.mimeType === "application/pdf" || extension === ".pdf") {
      return ocrPdf(inputPath, tmpDir);
    }
    return ocrImage(inputPath);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

async function ocrPdf(inputPath: string, tmpDir: string) {
  const outputPrefix = path.join(tmpDir, "page");
  await execFileAsync("pdftoppm", ["-png", "-r", "180", inputPath, outputPrefix], { timeout: OCR_TIMEOUT_MS });
  const entries = await readdir(tmpDir);
  const pages = entries
    .filter((entry) => /^page-\d+\.png$/.test(entry))
    .sort((a, b) => Number(a.match(/\d+/)?.[0] || 0) - Number(b.match(/\d+/)?.[0] || 0));
  const chunks: string[] = [];
  for (const page of pages) {
    chunks.push(await ocrImage(path.join(tmpDir, page)));
    if (chunks.join("\n").length >= MAX_OCR_CHARS) break;
  }
  return normalizeOcrText(chunks.join("\n\n")).slice(0, MAX_OCR_CHARS);
}

async function ocrImage(inputPath: string) {
  const { stdout } = await execFileAsync("tesseract", [inputPath, "stdout", "-l", "deu+eng"], { timeout: OCR_TIMEOUT_MS });
  return normalizeOcrText(stdout);
}

function normalizeOcrText(value: string) {
  return value
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildOcrSummary(document: OcrDocument, text: string, fallback: string) {
  const snippet = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 8)
    .slice(0, 4)
    .join(" ");
  if (!snippet) return `${fallback} OCR wurde ausgefuehrt, aber kein sicher lesbarer Text erkannt.`;
  return `${fallback} OCR-Inhalt: ${snippet}`.slice(0, 1200);
}

function fileExtensionFor(mimeType: string) {
  if (mimeType === "application/pdf") return ".pdf";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  return ".jpg";
}
