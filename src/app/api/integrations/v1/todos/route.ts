import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { integrationError, requireIntegrationUser } from "@/lib/integration-auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["read:properties"]);
  if (!user) return response;
  if (user.role !== Role.ADMIN) return integrationError("FORBIDDEN", "Dieser Endpunkt braucht einen Eigentuemer-Token.", 403);

  const showDone = request.nextUrl.searchParams.get("show") === "done";
  const sort = request.nextUrl.searchParams.get("sort") || "due";
  const where = { property: portalWhere(user), completedAt: showDone ? { not: null } : null };
  const todos = await prisma.propertyTodo.findMany({
    where,
    include: { property: { select: { id: true, name: true, address: true } } },
    orderBy: sort === "property"
      ? [{ property: { name: "asc" } }, { createdAt: "desc" }]
      : sort === "created"
        ? [{ createdAt: "desc" }]
        : [{ dueDate: "asc" }, { createdAt: "desc" }]
  });
  const openCounts = await prisma.propertyTodo.groupBy({
    by: ["propertyId"],
    where: { property: portalWhere(user), completedAt: null },
    _count: { _all: true }
  });
  const openCountByProperty = new Map(openCounts.map((item) => [item.propertyId, item._count._all]));
  return NextResponse.json({
    items: todos.map((todo) => serialize(todo, openCountByProperty.get(todo.propertyId) || 0)),
    nextCursor: null
  });
}

function serialize(todo: {
  id: string;
  propertyId: string;
  title: string;
  dueDate?: Date | null;
  completedAt: Date | null;
  createdAt?: Date;
  property: { id: string; name: string; address: string | null };
}, openTodoCount: number) {
  return {
    id: todo.id,
    propertyId: todo.propertyId,
    title: todo.title,
    dueDate: todo.dueDate?.toISOString?.() || null,
    completedAt: todo.completedAt?.toISOString() || null,
    createdAt: todo.createdAt?.toISOString?.() || null,
    property: todo.property,
    openTodoCount
  };
}
