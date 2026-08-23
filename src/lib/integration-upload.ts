import { isIP } from "net";

export type ResolvedIntegrationUploadFile = {
  file: File;
  buffer: Buffer;
  filename: string;
  mimeType: string;
  size: number;
};

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export async function resolveIntegrationUploadFile(input: {
  data: Record<string, unknown>;
  filename?: string | null;
  mimeType?: string | null;
}): Promise<ResolvedIntegrationUploadFile> {
  const directFile = objectValue(input.data.file);
  const filename = textValue(input.filename)
    || textValue(input.data.filename)
    || textValue(input.data.fileName)
    || fileName(directFile)
    || "dokument";
  const fallbackMimeType = textValue(input.mimeType)
    || textValue(input.data.mimeType)
    || fileMimeType(directFile)
    || "application/octet-stream";
  const base64 = firstBase64Value(input.data.fileBase64, input.data.base64, input.data.contentBase64)
    ?? (base64Chunks(input.data.fileBase64Chunks)
      || fileBase64(directFile)
      || base64Chunks(directFile?.fileBase64Chunks));

  let buffer: Buffer | null = null;
  if (base64 !== null) {
    buffer = decodeBase64File(base64);
  } else if (directFile?.url && typeof directFile.url === "string") {
    buffer = await downloadRemoteFile(directFile.url);
  } else if (directFile?.path) {
    throw new Error("Lokale Pfade des Clients werden nicht automatisch ins Portal übertragen. Bitte file.data/base64 oder fileBase64Chunks übergeben.");
  }

  if (!buffer) throw new Error("Dateiargument fehlt.");
  if (!buffer.length) throw new Error("Datei ist leer.");
  if (buffer.length > MAX_UPLOAD_BYTES) throw new Error("Datei ist zu gross. Maximal erlaubt sind 100 MB.");
  const mimeType = detectMimeType(buffer, filename, fallbackMimeType);
  return {
    file: new File([new Uint8Array(buffer)], filename, { type: mimeType }),
    buffer,
    filename,
    mimeType,
    size: buffer.length
  };
}

export function decodeBase64File(value: string): Buffer {
  const cleanBase64 = value.includes(",")
    ? value.substring(value.indexOf(",") + 1)
    : value;
  const compact = cleanBase64.replace(/\s/g, "");
  if (!compact) throw new Error("fileBase64 ist leer.");
  if (!/^[A-Za-z0-9+/=_-]+$/.test(compact)) throw new Error("fileBase64 ist ungueltig.");
  return Buffer.from(compact, compact.includes("-") || compact.includes("_") ? "base64url" : "base64");
}

export function detectMimeType(buffer: Buffer, filename: string, providedMimeType: string) {
  const lower = filename.toLowerCase();
  if (buffer.subarray(0, 4).toString("latin1") === "%PDF") return "application/pdf";
  if (buffer.subarray(0, 4).toString("hex") === "504b0304") {
    if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (lower.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    return "application/zip";
  }
  if (buffer.subarray(0, 3).toString("hex") === "ffd8ff") return "image/jpeg";
  if (buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return "image/png";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".zip")) return "application/zip";
  return providedMimeType || "application/octet-stream";
}

function fileBase64(file: Record<string, unknown> | null) {
  if (!file) return null;
  return firstBase64Value(file.base64, file.data, file.content);
}

function base64Chunks(value: unknown) {
  if (!Array.isArray(value) || !value.length) return null;
  return value.map((chunk) => String(chunk)).join("");
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function base64Value(value: unknown) {
  return typeof value === "string" ? value.trim() : null;
}

function firstBase64Value(...values: unknown[]) {
  for (const value of values) {
    const normalized = base64Value(value);
    if (normalized !== null) return normalized;
  }
  return null;
}

function objectValue(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function fileName(file: Record<string, unknown> | null) {
  return textValue(file?.filename) || textValue(file?.name) || textValue(file?.file_name);
}

function fileMimeType(file: Record<string, unknown> | null) {
  return textValue(file?.mimeType) || textValue(file?.type) || textValue(file?.mime_type);
}

async function downloadRemoteFile(urlString: string) {
  const url = new URL(urlString);
  if (url.protocol !== "https:") throw new Error("Remote-Datei konnte nicht geladen werden.");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname === "app" || hostname.endsWith(".local") || isPrivateIp(hostname)) {
    throw new Error("Remote-Datei konnte nicht geladen werden.");
  }
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error("Remote-Datei konnte nicht geladen werden.");
  const declaredLength = Number(response.headers.get("content-length") || "0");
  if (declaredLength > MAX_UPLOAD_BYTES) throw new Error("Datei ist zu gross. Maximal erlaubt sind 100 MB.");
  return Buffer.from(await response.arrayBuffer());
}

function isPrivateIp(hostname: string) {
  if (!isIP(hostname)) return false;
  if (hostname === "127.0.0.1" || hostname === "::1" || hostname === "0.0.0.0") return true;
  if (hostname.startsWith("10.") || hostname.startsWith("192.168.")) return true;
  const parts = hostname.split(".").map((part) => Number(part));
  return parts.length === 4 && (
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 169 && parts[1] === 254)
  );
}
