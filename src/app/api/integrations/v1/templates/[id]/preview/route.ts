import crypto from "crypto";
import { execFile } from "child_process";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import { NextRequest, NextResponse } from "next/server";
import { readPrivateFile } from "@/lib/files";
import { requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["read:contracts"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;

  const template = await prisma.contractTemplate.findFirst({ where: { id: params.id, ...portalWhere(user) } });
  if (!template) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Vorlage wurde nicht gefunden." } }, { status: 404 });
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
    return NextResponse.json({ error: { code: "PREVIEW_FAILED", message: "Vorschau konnte nicht erzeugt werden." } }, { status: 500 });
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
