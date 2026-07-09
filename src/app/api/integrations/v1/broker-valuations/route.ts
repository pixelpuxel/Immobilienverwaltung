import { AuditAction, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { clientIp } from "@/lib/auth";
import { integrationError, requireIntegrationUser } from "@/lib/integration-auth";
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
  const { user, response } = await requireIntegrationUser(request, ["write:properties"]);
  if (!user) return response;
  if (user.role !== Role.BROKER) return integrationError("FORBIDDEN", "Nur Makler koennen eine Kaufpreisschaetzung eintragen.", 403);

  const body = schema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return integrationError("BAD_REQUEST", "Ungueltige Daten.", 400);

  const allowedIds = await brokerPropertyIds(user.id);
  if (!allowedIds.includes(body.data.propertyId)) return integrationError("FORBIDDEN", "Diese Immobilie ist nicht freigegeben.", 403);

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
    },
    include: { user: { select: { id: true, email: true, username: true, name: true, role: true } } }
  });

  await auditLog({
    userId: user.id,
    action: AuditAction.PROPERTY_CHANGED,
    entity: "Property",
    entityId: body.data.propertyId,
    ipAddress: clientIp(request),
    detail: { brokerValuationUpdated: true, amount: body.data.amount }
  });

  return NextResponse.json({
    id: valuation.id,
    userId: valuation.userId,
    propertyId: valuation.propertyId,
    amount: valuation.amount?.toString() ?? null,
    note: valuation.note,
    createdAt: valuation.createdAt,
    updatedAt: valuation.updatedAt,
    user: valuation.user
  });
}
