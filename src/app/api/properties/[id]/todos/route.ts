import { AuditAction, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { assertSameOrigin, clientIp, requireApiUser } from "@/lib/auth";
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

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const property = await prisma.property.findFirst({ where: { id: params.id, ...portalWhere(user) }, select: { id: true, name: true } });
  if (!property) return NextResponse.json({ error: "Immobilie wurde nicht gefunden." }, { status: 404 });
  const body = createSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Bitte Aufgabe eintragen.", issues: body.error.issues }, { status: 400 });
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
  return NextResponse.json(serialize(todo));
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const body = updateSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Bitte Eingaben pruefen.", issues: body.error.issues }, { status: 400 });
  const existing = await prisma.propertyTodo.findFirst({
    where: { id: body.data.todoId, propertyId: params.id, property: portalWhere(user) },
    include: { property: { select: { id: true, name: true } } }
  });
  if (!existing) return NextResponse.json({ error: "To-do wurde nicht gefunden." }, { status: 404 });
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
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const body = deleteSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Bitte Eingaben pruefen.", issues: body.error.issues }, { status: 400 });
  const existing = await prisma.propertyTodo.findFirst({
    where: { id: body.data.todoId, propertyId: params.id, property: portalWhere(user) },
    include: { property: { select: { id: true, name: true } } }
  });
  if (!existing) return NextResponse.json({ error: "To-do wurde nicht gefunden." }, { status: 404 });
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

function serialize(todo: { id: string; title: string; dueDate?: Date | null; completedAt: Date | null; createdAt?: Date }) {
  return {
    id: todo.id,
    title: todo.title,
    dueDate: todo.dueDate?.toISOString?.() || null,
    completedAt: todo.completedAt?.toISOString() || null,
    createdAt: todo.createdAt?.toISOString?.() || null
  };
}
