import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { saveUpload } from "@/lib/files";
import { integrationError, requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["write:settings"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;

  const form = await request.formData();
  const file = form.get("signature");
  if (!(file instanceof File)) return integrationError("BAD_REQUEST", "Signaturdatei fehlt.", 400);
  if (!["image/png", "image/jpeg", "image/jpg"].includes(file.type)) {
    return integrationError("BAD_REQUEST", "Bitte eine PNG-Datei mit transparentem Hintergrund oder eine JPG-Datei hochladen.", 400);
  }

  const saved = await saveUpload(file, path.join(process.env.UPLOAD_PATH || "/app/uploads", "signatures"));
  const owner = await prisma.user.update({
    where: { id: user.id },
    data: { ownerSignaturePath: saved.storagePath }
  });
  return NextResponse.json({
    ok: true,
    owner: {
      id: owner.id,
      hasOwnerSignature: Boolean(owner.ownerSignaturePath)
    }
  });
}
