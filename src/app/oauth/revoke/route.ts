import { NextRequest, NextResponse } from "next/server";
import { hashApiToken } from "@/lib/integration-auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const token = String(form?.get("token") || "");
  if (token) {
    await prisma.apiToken
      .update({ where: { tokenHash: hashApiToken(token) }, data: { revokedAt: new Date() } })
      .catch(() => undefined);
  }
  return new NextResponse(null, { status: 200 });
}
