import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { isValidTimeZone } from "@/lib/time-zone";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  timeZone: z.string().trim().min(1)
});

export async function PATCH(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user?.portalInstanceId) return NextResponse.json({ error: "Keine Portal-Instanz gefunden." }, { status: 400 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success || !isValidTimeZone(parsed.data.timeZone)) {
    return NextResponse.json({ error: "Bitte eine gueltige Zeitzone eingeben." }, { status: 400 });
  }

  const portal = await prisma.portalInstance.update({
    where: { id: user.portalInstanceId },
    data: { timeZone: parsed.data.timeZone },
    select: { timeZone: true }
  });

  return NextResponse.json(portal);
}
