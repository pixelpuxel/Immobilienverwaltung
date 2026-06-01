import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { createPlainApiToken, hashApiToken } from "@/lib/integration-auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

const tokenSchema = z.object({
  name: z.string().min(1),
  scopes: z.array(z.string()).min(1),
  expiresAt: z.string().datetime().nullable().optional()
});

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const tokens = await prisma.apiToken.findMany({
    where: { user: portalWhere(user) },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, scopes: true, lastUsedAt: true, expiresAt: true, revokedAt: true, createdAt: true, user: { select: { email: true, name: true } } }
  });
  return NextResponse.json(tokens);
}

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const body = tokenSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Ungueltige Daten.", issues: body.error.issues }, { status: 400 });
  const token = createPlainApiToken();
  const apiToken = await prisma.apiToken.create({
    data: {
      userId: user.id,
      portalInstanceId: user.portalInstanceId,
      name: body.data.name,
      scopes: body.data.scopes,
      expiresAt: body.data.expiresAt ? new Date(body.data.expiresAt) : null,
      tokenHash: hashApiToken(token)
    },
    select: { id: true, name: true, scopes: true, expiresAt: true, createdAt: true }
  });
  return NextResponse.json({ token, apiToken }, { status: 201 });
}

