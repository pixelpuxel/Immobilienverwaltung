import { Role } from "@prisma/client";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { saveUpload } from "@/lib/files";
import { canAccessPortalUser } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const admin = await requireApiUser(request, [Role.ADMIN]);
  if (!admin) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target || !canAccessPortalUser(admin, target)) return NextResponse.json({ error: "Benutzer gehoert nicht zu dieser Instanz." }, { status: 403 });
  const form = await request.formData();
  const file = form.get("signature");
  if (!(file instanceof File)) return NextResponse.json({ error: "Signaturdatei fehlt." }, { status: 400 });
  if (!["image/jpeg", "image/jpg"].includes(file.type)) {
    return NextResponse.json({ error: "Bitte eine JPG-Datei als Unterschrift hochladen." }, { status: 400 });
  }
  const saved = await saveUpload(file, path.join(process.env.UPLOAD_PATH || "/app/uploads", "signatures"));
  await prisma.user.update({ where: { id: target.id }, data: { ownerSignaturePath: saved.storagePath } });
  return NextResponse.json({ ok: true });
}
