import { execFile } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";

import { readPrivateFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";

const execFileAsync = promisify(execFile);
const MAX_OCR_BUFFER = 50 * 1024 * 1024;

type OcrDocument = {
  id: string;
  filename: string;
  mimeType: string;
  storagePath: string;
};

export async function runAndStoreDocumentOcr(document: OcrDocument) {
  await prisma.document.update({
    where: { id: document.id },
    data: { ocrStatus: "RUNNING", ocrError: null }
  });

  try {
    const text = (await extractDocumentText(document)).trim();
    const updated = await prisma.document.update({
      where: { id: document.id },
      data: {
        ocrText: text,
        ocrStatus: text ? "COMPLETED" : "NO_TEXT",
        ocrProcessedAt: new Date(),
        ocrError: null
      },
      select: { id: true, ocrText: true, ocrStatus: true, ocrProcessedAt: true, ocrError: true }
    });
    return updated;
  } catch (error) {
    const message = error instanceof Error ? error.message : "OCR fehlgeschlagen.";
    await prisma.document.update({
      where: { id: document.id },
      data: { ocrStatus: "FAILED", ocrProcessedAt: new Date(), ocrError: message }
    });
    throw error;
  }
}

async function extractDocumentText(document: OcrDocument) {
  await readPrivateFile(document.storagePath);
  const mimeType = document.mimeType.toLowerCase();
  const extension = path.extname(document.filename).toLowerCase();
  if (mimeType === "application/pdf" || extension === ".pdf") {
    const { stdout: embeddedText } = await execFileAsync(
      "pdftotext",
      ["-layout", document.storagePath, "-"],
      { timeout: 120_000, maxBuffer: MAX_OCR_BUFFER }
    );
    if (embeddedText.trim().length >= 100) return embeddedText;
    return ocrPdf(document.storagePath);
  }
  if (mimeType.startsWith("image/") || [".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp"].includes(extension)) {
    return ocrImage(document.storagePath);
  }
  throw new Error(`OCR wird fuer ${document.mimeType || extension || "diesen Dateityp"} nicht unterstuetzt.`);
}

async function ocrPdf(storagePath: string) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "immo-portal-ocr-"));
  try {
    const prefix = path.join(tempDir, "page");
    await execFileAsync(
      "pdftoppm",
      ["-r", "300", "-jpeg", "-jpegopt", "quality=92", storagePath, prefix],
      { timeout: 600_000, maxBuffer: MAX_OCR_BUFFER }
    );
    const pages = (await fs.readdir(tempDir))
      .filter((name) => /^page-\d+\.jpg$/i.test(name))
      .sort((a, b) => pageNumber(a) - pageNumber(b));
    if (!pages.length) throw new Error("PDF konnte nicht in OCR-Seiten umgewandelt werden.");
    const texts: string[] = [];
    for (const page of pages) texts.push(await ocrImage(path.join(tempDir, page)));
    return texts.map((text, index) => `--- Seite ${index + 1} ---\n${text.trim()}`).join("\n\n");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function ocrImage(storagePath: string) {
  const { stdout } = await execFileAsync(
    "tesseract",
    [storagePath, "stdout", "-l", "deu+eng", "--psm", "3", "-c", "preserve_interword_spaces=1"],
    { timeout: 300_000, maxBuffer: MAX_OCR_BUFFER }
  );
  return stdout;
}

function pageNumber(filename: string) {
  return Number(filename.match(/(\d+)/)?.[1] || 0);
}
