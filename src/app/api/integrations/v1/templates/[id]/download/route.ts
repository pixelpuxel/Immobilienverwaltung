import { NextRequest, NextResponse } from "next/server";
import { readPrivateFile } from "@/lib/files";
import { requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["read:contracts"]);
  if (!user) return response;
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;

  const template = await prisma.contractTemplate.findFirst({ where: { id: params.id, ...portalWhere(user) } });
  if (!template) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Vorlage wurde nicht gefunden." } }, { status: 404 });
  const body = await readPrivateFile(template.storagePath);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": template.mimeType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(template.filename)}"`
    }
  });
}
