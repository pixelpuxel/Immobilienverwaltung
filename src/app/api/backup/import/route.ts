import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { BackupImportError, backupErrorMessage, importBackupFormData } from "@/lib/backup-import";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });

  try {
    const summary = await importBackupFormData(await request.formData(), user);
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    console.error("Backup import failed", error);
    return NextResponse.json(
      { error: backupErrorMessage(error) },
      { status: error instanceof BackupImportError ? error.status : 500 }
    );
  }
}
