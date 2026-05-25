import crypto from "crypto";
import { execFile } from "child_process";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { readPrivateFile } from "@/lib/files";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return svgResponse("Login", "Nicht angemeldet", 401);

  const template = await prisma.contractTemplate.findFirst({ where: { id: params.id, ...portalWhere(user) } });
  if (!template) return svgResponse("Fehlt", "Keine Vorlage", 404);

  const body = await readPrivateFile(template.storagePath);
  const tmpDir = path.join(os.tmpdir(), `template-thumb-${crypto.randomUUID()}`);
  await mkdir(tmpDir, { recursive: true });
  try {
    const inputPath = path.join(tmpDir, "input.docx");
    await writeFile(inputPath, body);
    await execFileAsync("libreoffice", ["--headless", "--convert-to", "pdf", "--outdir", tmpDir, inputPath], { timeout: 90_000 });
    const outputPrefix = path.join(tmpDir, "page");
    await execFileAsync("pdftoppm", ["-f", "1", "-singlefile", "-png", "-scale-to", "360", path.join(tmpDir, "input.pdf"), outputPrefix], { timeout: 60_000 });
    const png = await readFile(`${outputPrefix}.png`);
    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=300"
      }
    });
  } catch {
    return svgResponse("DOCX", template.name);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

function svgResponse(title: string, subtitle: string, status = 200) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="240" viewBox="0 0 360 240">
    <rect width="360" height="240" fill="#f7faf8"/>
    <rect x="26" y="22" width="308" height="196" rx="10" fill="#ffffff" stroke="#d9dfdb"/>
    <text x="180" y="110" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#17695f">${escapeXml(title)}</text>
    <text x="180" y="145" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" fill="#66716b">${escapeXml(subtitle)}</text>
  </svg>`;
  return new NextResponse(svg, {
    status,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "private, max-age=120"
    }
  });
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").slice(0, 46);
}
