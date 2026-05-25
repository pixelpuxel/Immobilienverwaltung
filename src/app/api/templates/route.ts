import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { saveUpload } from "@/lib/files";
import { env } from "@/lib/env";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  return NextResponse.json(await prisma.contractTemplate.findMany({ where: portalWhere(user), orderBy: { createdAt: "desc" } }));
}

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.name.endsWith(".docx")) {
    return NextResponse.json({ error: "Bitte DOCX-Vorlage hochladen." }, { status: 400 });
  }
  const saved = await saveUpload(file, env.contractsPath);
  const template = await prisma.contractTemplate.create({
    data: {
      name: String(form.get("name") || file.name),
      filename: saved.filename,
      storagePath: saved.storagePath,
      mimeType: saved.mimeType,
      size: saved.size,
      portalInstanceId: user.portalInstanceId
    }
  });
  return NextResponse.json(template, { status: 201 });
}
