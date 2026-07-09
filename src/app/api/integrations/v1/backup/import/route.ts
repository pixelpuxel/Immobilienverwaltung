import { NextRequest, NextResponse } from "next/server";
import { BackupImportError, backupErrorMessage, importBackupFormData } from "@/lib/backup-import";
import { integrationError, requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["backup:import"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;

  try {
    const summary = await importBackupFormData(await request.formData(), user);
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    console.error("Integration backup import failed", error);
    return integrationError(
      error instanceof BackupImportError ? "BAD_REQUEST" : "IMPORT_FAILED",
      backupErrorMessage(error),
      error instanceof BackupImportError ? error.status : 500
    );
  }
}
