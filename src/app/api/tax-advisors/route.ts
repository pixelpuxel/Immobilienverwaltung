import { AuditAction, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { assertSameOrigin, clientIp, hashPassword, requireApiUser } from "@/lib/auth";
import { sendWelcomeMail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  email: z.string().email().optional().or(z.literal("")),
  username: z.string().optional(),
  name: z.string().optional(),
  password: z.string().min(8).default("BitteSofortAendern123!")
});

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const admin = await requireApiUser(request, [Role.ADMIN]);
  if (!admin) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Bitte die Eingaben prüfen.", issues: body.error.issues }, { status: 400 });
  const identity = accountIdentity(body.data.email, body.data.username);
  if (!identity) return NextResponse.json({ error: "Bitte E-Mail oder Benutzername angeben." }, { status: 400 });
  const existing = await prisma.user.findFirst({ where: { OR: [{ email: identity.email }, ...(identity.username ? [{ username: identity.username }] : [])] } });
  if (existing) return NextResponse.json({ error: "E-Mail oder Benutzername ist bereits vergeben." }, { status: 400 });

  const user = await prisma.user.create({
    data: {
      email: identity.email,
      portalInstanceId: admin.portalInstanceId,
      username: identity.username,
      name: body.data.name?.trim() || "Steuerberater",
      role: Role.TAX_ADVISOR,
      active: true,
      passwordHash: await hashPassword(body.data.password)
    }
  });
  await auditLog({ userId: admin.id, action: AuditAction.USER_INVITED, entity: "User", entityId: user.id, ipAddress: clientIp(request), detail: { role: Role.TAX_ADVISOR } });
  const mail = await sendWelcomeMail({
    to: user.email,
    name: user.name,
    roleLabel: "Steuerberater",
    identifier: user.username || user.email,
    password: body.data.password,
    portalInstanceId: admin.portalInstanceId
  }).catch((error) => ({ sent: false, reason: error instanceof Error ? error.message : "unknown" }));
  return NextResponse.json({ id: user.id, email: user.email, username: user.username, role: user.role, mail }, { status: 201 });
}

function accountIdentity(email?: string, username?: string) {
  const normalizedEmail = email?.trim().toLowerCase();
  const normalizedUsername = username?.trim().toLowerCase();
  if (!normalizedEmail && !normalizedUsername) return null;
  return {
    email: normalizedEmail || `${normalizedUsername}@portal.local`,
    username: normalizedUsername || null
  };
}
