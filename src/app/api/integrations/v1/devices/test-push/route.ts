import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireIntegrationUser } from "@/lib/integration-auth";
import { apnsConfigured, sendApnsPush } from "@/lib/apns";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const testPushSchema = z.object({
  deviceId: z.string().trim().min(1)
});

export async function POST(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request);
  if (!user) return response;

  const parsed = testPushSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Geraet fehlt.", issues: parsed.error.issues } },
      { status: 400 }
    );
  }

  const device = await prisma.deviceInstallation.findFirst({
    where: {
      id: parsed.data.deviceId,
      platform: "ios",
      revokedAt: null,
      ...(user.role === Role.ADMIN
        ? { portalInstanceId: user.portalInstanceId }
        : { userId: user.id })
    },
    select: {
      id: true,
      deviceToken: true,
      environment: true,
      deviceName: true
    }
  });

  if (!device) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Geraet nicht gefunden." } }, { status: 404 });
  }

  if (!apnsConfigured()) {
    await rememberPushAttempt(device.id, "not_configured", "APNs ist nicht konfiguriert.");
    return NextResponse.json(
      { error: { code: "APNS_NOT_CONFIGURED", message: "APNs ist nicht konfiguriert. Bitte APNS_TEAM_ID, APNS_KEY_ID, APNS_BUNDLE_ID und APNS_PRIVATE_KEY setzen." } },
      { status: 400 }
    );
  }

  try {
    const result = await sendApnsPush({
      deviceToken: device.deviceToken,
      environment: device.environment,
      payload: {
        aps: {
          alert: {
            title: "Immoportal Test",
            body: `Test-Push an ${device.deviceName || "iPhone"}`
          },
          sound: "default"
        },
        targetType: "dashboard",
        targetTitle: "Portal"
      }
    });

    await rememberPushAttempt(
      device.id,
      result.ok ? "sent" : `failed:${result.status || "unknown"}`,
      result.ok ? null : result.reason || `APNs HTTP ${result.status || "unbekannt"}`
    );

    return NextResponse.json(
      { ok: result.ok, result },
      { status: result.ok ? 200 : 502 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter APNs-Fehler";
    await rememberPushAttempt(device.id, "error", message);
    return NextResponse.json(
      { error: { code: "APNS_ERROR", message } },
      { status: 502 }
    );
  }
}

async function rememberPushAttempt(deviceId: string, status: string, error: string | null) {
  await prisma.deviceInstallation.update({
    where: { id: deviceId },
    data: {
      lastPushAttemptAt: new Date(),
      lastPushStatus: status,
      lastPushError: error
    }
  });
}
