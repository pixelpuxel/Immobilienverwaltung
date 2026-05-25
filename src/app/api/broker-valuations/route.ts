import { AuditAction, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { assertSameOrigin, clientIp, requireApiUser } from "@/lib/auth";
import { brokerPropertyIds } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const optionalNumber = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return null;
  return value;
}, z.coerce.number().optional().nullable());

const schema = z.object({
  propertyId: z.string().min(1),
  amount: optionalNumber,
  note: z.string().optional().nullable()
});

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  if (user.role !== Role.BROKER) return NextResponse.json({ error: "Nur Makler koennen eine Kaufpreisschaetzung eintragen." }, { status: 403 });

  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Ungueltige Daten.", issues: body.error.issues }, { status: 400 });

  const allowedIds = await brokerPropertyIds(user.id);
  if (!allowedIds.includes(body.data.propertyId)) return NextResponse.json({ error: "Diese Immobilie ist nicht freigegeben." }, { status: 403 });

  const valuation = await prisma.brokerValuation.upsert({
    where: { userId_propertyId: { userId: user.id, propertyId: body.data.propertyId } },
    update: {
      amount: body.data.amount,
      note: body.data.note?.trim() || null
    },
    create: {
      userId: user.id,
      propertyId: body.data.propertyId,
      amount: body.data.amount,
      note: body.data.note?.trim() || null
    }
  });

  await auditLog({
    userId: user.id,
    action: AuditAction.PROPERTY_CHANGED,
    entity: "Property",
    entityId: body.data.propertyId,
    ipAddress: clientIp(request),
    detail: { brokerValuationUpdated: true, amount: body.data.amount }
  });

  return NextResponse.json(valuation);
}
