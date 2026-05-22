import { AuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { assertSameOrigin, clientIp, createSessionToken, setSessionCookie, verifyPassword } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const ip = clientIp(request);
  if (!checkRateLimit(`login:${ip}`)) return NextResponse.json({ error: "Zu viele Versuche." }, { status: 429 });

  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Ungueltige Zugangsdaten." }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email: body.data.email } });
  if (!user || !user.active || !(await verifyPassword(body.data.password, user.passwordHash))) {
    return NextResponse.json({ error: "E-Mail oder Passwort ist falsch." }, { status: 401 });
  }

  await auditLog({ userId: user.id, action: AuditAction.LOGIN, ipAddress: ip });
  const response = NextResponse.json({ ok: true, role: user.role });
  setSessionCookie(response, createSessionToken(user));
  return response;
}
