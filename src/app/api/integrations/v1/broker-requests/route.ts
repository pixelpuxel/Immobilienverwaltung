import { AuditAction, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { clientIp } from "@/lib/auth";
import { integrationError, requireIntegrationUser } from "@/lib/integration-auth";
import { brokerPropertyIds } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  propertyId: z.string().min(1),
  message: z.string().trim().min(1).max(1000)
});

export async function POST(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["write:properties"]);
  if (!user) return response;
  if (user.role !== Role.BROKER) return integrationError("FORBIDDEN", "Nur Makler koennen Unterlagen anfordern.", 403);

  const body = schema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return integrationError("BAD_REQUEST", "Bitte Anfrage und Immobilie pruefen.", 400);

  const allowedIds = await brokerPropertyIds(user.id);
  if (!allowedIds.includes(body.data.propertyId)) return integrationError("FORBIDDEN", "Diese Immobilie ist nicht freigegeben.", 403);

  const property = await prisma.property.findUnique({ where: { id: body.data.propertyId }, select: { id: true, name: true } });
  if (!property) return integrationError("NOT_FOUND", "Immobilie wurde nicht gefunden.", 404);

  const requestRecord = await prisma.brokerRequest.upsert({
    where: { userId_propertyId: { userId: user.id, propertyId: property.id } },
    update: { status: "active", message: body.data.message },
    create: { userId: user.id, propertyId: property.id, status: "active", message: body.data.message },
    include: {
      user: { select: { id: true, email: true, username: true, name: true, role: true } },
      property: { select: { id: true, name: true } }
    }
  });

  const todo = await prisma.propertyTodo.create({
    data: {
      propertyId: property.id,
      title: `Makleranfrage: ${body.data.message}`
    },
    select: { id: true, title: true, dueDate: true, completedAt: true, createdAt: true }
  });

  await auditLog({
    userId: user.id,
    action: AuditAction.PERMISSION_CHANGED,
    entity: "BrokerRequest",
    entityId: requestRecord.id,
    ipAddress: clientIp(request),
    detail: { propertyId: property.id, property: property.name, message: body.data.message, todoId: todo.id }
  });

  return NextResponse.json({
    id: requestRecord.id,
    propertyId: requestRecord.propertyId,
    message: requestRecord.message,
    status: requestRecord.status,
    createdAt: requestRecord.createdAt,
    property: requestRecord.property,
    user: requestRecord.user,
    todo
  }, { status: 201 });
}
