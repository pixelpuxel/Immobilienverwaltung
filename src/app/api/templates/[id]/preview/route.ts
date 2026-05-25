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
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });

  const template = await prisma.contractTemplate.findFirst({ where: { id: params.id, ...portalWhere(user) } });
  if (!template) return NextResponse.json({ error: "Vorlage wurde nicht gefunden." }, { status: 404 });
  const body = await readPrivateFile(template.storagePath);
  const tmpDir = path.join(os.tmpdir(), `template-preview-${crypto.randomUUID()}`);
  await mkdir(tmpDir, { recursive: true });
  try {
    const inputPath = path.join(tmpDir, "input.docx");
    await writeFile(inputPath, body);
    await execFileAsync("libreoffice", ["--headless", "--convert-to", "pdf", "--outdir", tmpDir, inputPath], { timeout: 90_000 });
    const pdf = await readFile(path.join(tmpDir, "input.pdf"));
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${encodeURIComponent(template.name)}.pdf"`,
        "Cache-Control": "private, max-age=120"
      }
    });
  } catch {
    return NextResponse.json({ error: "Vorschau konnte nicht erzeugt werden." }, { status: 500 });
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
