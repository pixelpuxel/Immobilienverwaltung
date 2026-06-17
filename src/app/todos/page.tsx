import { Role } from "@prisma/client";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/lib/auth";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TodosPage({ searchParams }: { searchParams?: { show?: string; sort?: string } }) {
  const user = await requireUser([Role.ADMIN]);
  const showDone = searchParams?.show === "done";
  const sort = searchParams?.sort || "due";
  const todos = await prisma.propertyTodo.findMany({
    where: { property: portalWhere(user), completedAt: showDone ? { not: null } : null },
    include: { property: { include: { units: { select: { id: true, unitNumber: true } } } } },
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

  return (
    <AppShell role={user.role} userId={user.id} email={user.email} canSwitchView={user.role === Role.ADMIN || Boolean(user.impersonatedByAdminId)}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Offene To-dos</h1>
          <p className="mt-2 text-muted">Zentrale Aufgabenliste ueber alle Immobilien hinweg.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="button-secondary" href="/todos?sort=due">Nach Fälligkeit</Link>
          <Link className="button-secondary" href="/todos?sort=property">Nach Immobilie</Link>
          <Link className="button-secondary" href="/todos?sort=created">Nach Erstellung</Link>
          <Link className="button-secondary" href={showDone ? "/todos" : "/todos?show=done"}>{showDone ? "Offene anzeigen" : "Erledigte anzeigen"}</Link>
        </div>
      </div>
      <div className="mt-6 overflow-hidden rounded-lg border border-line bg-white">
        {todos.length ? todos.map((todo) => (
          <div className="grid gap-3 border-b border-line p-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_220px_160px]" key={todo.id}>
            <div>
              <Link className="font-bold hover:underline" href={`/properties/${todo.propertyId}#todo-${todo.id}`}>{todo.title}</Link>
              <div className="mt-1 text-sm text-muted">{todo.property.name}</div>
            </div>
            <div className="text-sm">
              <div className="font-semibold">Offen bei Objekt</div>
              <div className="text-muted">{openCountByProperty.get(todo.propertyId) || 0} offene To-dos</div>
            </div>
            <div className="text-sm">
              <div className="font-semibold">{todo.dueDate ? formatDate(todo.dueDate) : "Keine Fälligkeit"}</div>
              <div className="text-muted">Erstellt {formatDate(todo.createdAt)}</div>
            </div>
          </div>
        )) : (
          <div className="p-6 text-muted">{showDone ? "Keine erledigten To-dos." : "Keine offenen To-dos."}</div>
        )}
      </div>
    </AppShell>
  );
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("de-DE").format(value);
}
