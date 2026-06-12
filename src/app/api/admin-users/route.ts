import { AuditAction, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { assertSameOrigin, clientIp, hashPassword, requireApiUser } from "@/lib/auth";
import { sendWelcomeMail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  name: z.string().optional(),
  username: z.string().optional(),
  email: z.string().email(),
  password: z.string().min(8)
});

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const actor = await requireApiUser(request, [Role.ADMIN]);
  if (!actor) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Bitte die Eingaben pruefen.", issues: body.error.issues }, { status: 400 });

  const email = body.data.email.trim().toLowerCase();
  const username = body.data.username?.trim().toLowerCase() || null;
  const existing = await prisma.user.findFirst({ where: { OR: [{ email }, ...(username ? [{ username }] : [])] } });
  if (existing) return NextResponse.json({ error: "E-Mail oder Benutzername ist bereits vergeben." }, { status: 400 });

  const user = await prisma.user.create({
    data: {
      email,
      portalInstanceId: actor.portalInstanceId,
      username,
      name: body.data.name?.trim() || "Eigentümer",
      role: Role.ADMIN,
      active: true,
      passwordHash: await hashPassword(body.data.password)
    }
  });
  await auditLog({ userId: actor.id, action: AuditAction.USER_INVITED, entity: "User", entityId: user.id, ipAddress: clientIp(request), detail: { role: Role.ADMIN } });
  const mail = await sendWelcomeMail({
    to: user.email,
    name: user.name,
    roleLabel: "Eigentümer",
    identifier: user.username || user.email,
    password: body.data.password,
    portalInstanceId: actor.portalInstanceId
  }).catch((error) => ({ sent: false, reason: error instanceof Error ? error.message : "unknown" }));
  return NextResponse.json({ id: user.id, email: user.email, username: user.username, role: user.role, mail }, { status: 201 });
}
