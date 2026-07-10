import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireIntegrationUser } from "@/lib/integration-auth";
import { prisma } from "@/lib/prisma";

const deviceSchema = z.object({
  deviceToken: z.string().trim().min(20),
  platform: z.string().trim().default("ios"),
  environment: z.enum(["development", "production"]).default("production"),
  deviceName: z.string().trim().nullable().optional(),
  appVersion: z.string().trim().nullable().optional(),
  buildNumber: z.string().trim().nullable().optional(),
  locale: z.string().trim().nullable().optional(),
  timeZone: z.string().trim().nullable().optional()
});

export async function POST(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request);
  if (!user) return response;

  const parsed = deviceSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Ungueltige Geraetedaten.", issues: parsed.error.issues } }, { status: 400 });
  }

  const data = parsed.data;
  const installation = await prisma.deviceInstallation.upsert({
    where: { deviceToken: data.deviceToken },
    create: {
      userId: user.id,
      portalInstanceId: user.portalInstanceId,
      deviceToken: data.deviceToken,
      platform: data.platform,
      environment: data.environment,
      deviceName: data.deviceName || null,
      appVersion: data.appVersion || null,
      buildNumber: data.buildNumber || null,
      locale: data.locale || null,
      timeZone: data.timeZone || null,
      lastSeenAt: new Date(),
      revokedAt: null
    },
    update: {
      userId: user.id,
      portalInstanceId: user.portalInstanceId,
      platform: data.platform,
      environment: data.environment,
      deviceName: data.deviceName || null,
      appVersion: data.appVersion || null,
      buildNumber: data.buildNumber || null,
      locale: data.locale || null,
      timeZone: data.timeZone || null,
      lastSeenAt: new Date(),
      revokedAt: null
    },
    select: {
      id: true,
      platform: true,
      environment: true,
      deviceName: true,
      appVersion: true,
      buildNumber: true,
      lastSeenAt: true
    }
  });

  return NextResponse.json({ ok: true, device: installation });
}

export async function DELETE(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request);
  if (!user) return response;

  const parsed = z.object({ deviceToken: z.string().trim().min(20) }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Geraetetoken fehlt." } }, { status: 400 });
  }

  await prisma.deviceInstallation.updateMany({
    where: { userId: user.id, deviceToken: parsed.data.deviceToken },
    data: { revokedAt: new Date() }
  });

  return NextResponse.json({ ok: true });
}
