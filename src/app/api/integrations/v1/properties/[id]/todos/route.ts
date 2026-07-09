import { AuditAction, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { clientIp } from "@/lib/auth";
import { integrationError, requireIntegrationUser } from "@/lib/integration-auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  title: z.string().trim().min(1).max(500),
  dueDate: z.preprocess((value) => value === "" || value === null || value === undefined ? null : value, z.coerce.date().nullable().optional())
});

const updateSchema = z.object({
  todoId: z.string(),
  completed: z.boolean()
});

const deleteSchema = z.object({
  todoId: z.string()
});

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["read:properties"]);
  if (!user) return response;
  const forbidden = requireAdmin(user);
  if (forbidden) return forbidden;

  const property = await prisma.property.findFirst({ where: { id: params.id, ...portalWhere(user) }, select: { id: true } });
  if (!property) return integrationError("NOT_FOUND", "Immobilie wurde nicht gefunden.", 404);
  const includeDone = request.nextUrl.searchParams.get("includeDone") === "true";
  const todos = await prisma.propertyTodo.findMany({
    where: { propertyId: property.id, ...(includeDone ? {} : { completedAt: null }) },
    orderBy: [{ completedAt: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    select: { id: true, title: true, dueDate: true, completedAt: true, createdAt: true }
  });
  return NextResponse.json({ items: todos.map(serialize), nextCursor: null });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["write:properties"]);
  if (!user) return response;
  const forbidden = requireAdmin(user);
  if (forbidden) return forbidden;

  const property = await prisma.property.findFirst({ where: { id: params.id, ...portalWhere(user) }, select: { id: true, name: true } });
  if (!property) return integrationError("NOT_FOUND", "Immobilie wurde nicht gefunden.", 404);
  const body = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return integrationError("BAD_REQUEST", "Bitte Aufgabe eintragen.", 400);
  const todo = await prisma.propertyTodo.create({
    data: { propertyId: property.id, title: body.data.title, dueDate: body.data.dueDate || null },
    select: { id: true, title: true, dueDate: true, completedAt: true, createdAt: true }
  });
  await auditLog({
    userId: user.id,
    action: AuditAction.PERMISSION_CHANGED,
    entity: "PropertyTodo",
    entityId: todo.id,
    ipAddress: clientIp(request),
    detail: { propertyId: property.id, property: property.name, action: "created" }
  });
  return NextResponse.json(serialize(todo), { status: 201 });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["write:properties"]);
  if (!user) return response;
  const forbidden = requireAdmin(user);
  if (forbidden) return forbidden;

  const body = updateSchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return integrationError("BAD_REQUEST", "Bitte Eingaben pruefen.", 400);
  const existing = await prisma.propertyTodo.findFirst({
    where: { id: body.data.todoId, propertyId: params.id, property: portalWhere(user) },
    include: { property: { select: { id: true, name: true } } }
  });
  if (!existing) return integrationError("NOT_FOUND", "To-do wurde nicht gefunden.", 404);
  const todo = await prisma.propertyTodo.update({
    where: { id: existing.id },
    data: { completedAt: body.data.completed ? new Date() : null },
    select: { id: true, title: true, dueDate: true, completedAt: true, createdAt: true }
  });
  await auditLog({
    userId: user.id,
    action: AuditAction.PERMISSION_CHANGED,
    entity: "PropertyTodo",
    entityId: todo.id,
    ipAddress: clientIp(request),
    detail: { propertyId: existing.property.id, property: existing.property.name, completed: body.data.completed }
  });
  return NextResponse.json(serialize(todo));
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request, ["write:properties"]);
  if (!user) return response;
  const forbidden = requireAdmin(user);
  if (forbidden) return forbidden;

  const body = deleteSchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return integrationError("BAD_REQUEST", "Bitte Eingaben pruefen.", 400);
  const existing = await prisma.propertyTodo.findFirst({
    where: { id: body.data.todoId, propertyId: params.id, property: portalWhere(user) },
    include: { property: { select: { id: true, name: true } } }
  });
  if (!existing) return integrationError("NOT_FOUND", "To-do wurde nicht gefunden.", 404);
  await prisma.propertyTodo.delete({ where: { id: existing.id } });
  await auditLog({
    userId: user.id,
    action: AuditAction.PERMISSION_CHANGED,
    entity: "PropertyTodo",
    entityId: existing.id,
    ipAddress: clientIp(request),
    detail: { propertyId: existing.property.id, property: existing.property.name, action: "deleted" }
  });
  return NextResponse.json({ ok: true });
}

function requireAdmin(user: { role: Role }) {
  if (user.role !== Role.ADMIN) return integrationError("FORBIDDEN", "Dieser Endpunkt braucht einen Eigentuemer-Token.", 403);
  return null;
}

function serialize(todo: { id: string; title: string; dueDate?: Date | null; completedAt: Date | null; createdAt?: Date }) {
  return {
    id: todo.id,
    title: todo.title,
    dueDate: todo.dueDate?.toISOString?.() || null,
    completedAt: todo.completedAt?.toISOString() || null,
    createdAt: todo.createdAt?.toISOString?.() || null
  };
}
