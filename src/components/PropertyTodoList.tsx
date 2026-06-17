"use client";

import { useState } from "react";

type TodoItem = {
  id: string;
  title: string;
  dueDate?: string | null;
  completedAt: string | null;
};

export function PropertyTodoList({ propertyId, initialTodos }: { propertyId: string; initialTodos: TodoItem[] }) {
  const [todos, setTodos] = useState(initialTodos);
  const [message, setMessage] = useState("");

  async function createTodo(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") || "").trim();
    if (!title) return;
    const response = await fetch(`/api/properties/${propertyId}/todos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, dueDate: String(form.get("dueDate") || "") || null })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(body.error || "To-do konnte nicht angelegt werden.");
      return;
    }
    setTodos((current) => [body, ...current]);
    event.currentTarget.reset();
  }

  async function toggleTodo(todoId: string, completed: boolean) {
    setMessage("");
    const response = await fetch(`/api/properties/${propertyId}/todos`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ todoId, completed })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(body.error || "To-do konnte nicht aktualisiert werden.");
      return;
    }
    setTodos((current) => current.map((todo) => (todo.id === body.id ? body : todo)));
  }

  async function deleteTodo(todoId: string) {
    setMessage("");
    const response = await fetch(`/api/properties/${propertyId}/todos`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ todoId })
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setMessage(body.error || "To-do konnte nicht geloescht werden.");
      return;
    }
    setTodos((current) => current.filter((todo) => todo.id !== todoId));
  }

  const openTodos = todos.filter((todo) => !todo.completedAt);
  const doneTodos = todos.filter((todo) => todo.completedAt);

  return (
    <section className="rounded-lg border border-line bg-panel p-4">
      <h2 className="text-lg font-bold">To-do-Liste</h2>
      <p className="mt-1 text-sm text-muted">Offene Aufgaben zu dieser Immobilie abhaken oder erledigte Punkte nachvollziehen.</p>
      <form className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto]" onSubmit={createTodo}>
        <input name="title" placeholder="Neue Aufgabe" />
        <input aria-label="Fälligkeit" name="dueDate" type="date" />
        <button className="px-4 py-2 text-sm" type="submit">Hinzufuegen</button>
      </form>
      {message ? <div className="mt-3 rounded-md border border-line bg-white p-2 text-sm text-muted">{message}</div> : null}
      <TodoSection items={openTodos} empty="Keine offenen Aufgaben." onToggle={toggleTodo} onDelete={deleteTodo} />
      {doneTodos.length ? (
        <details className="mt-4 overflow-hidden rounded-md border border-line bg-white">
          <summary className="cursor-pointer list-none px-3 py-2 text-sm font-bold text-muted [&::-webkit-details-marker]:hidden">Erledigte Aufgaben ({doneTodos.length})</summary>
          <div className="border-t border-line">
            <TodoSection items={doneTodos} empty="" onToggle={toggleTodo} onDelete={deleteTodo} />
          </div>
        </details>
      ) : null}
    </section>
  );
}

function TodoSection({
  items,
  empty,
  onToggle,
  onDelete
}: {
  items: TodoItem[];
  empty: string;
  onToggle: (todoId: string, completed: boolean) => void;
  onDelete: (todoId: string) => void;
}) {
  if (!items.length) return empty ? <div className="mt-3 rounded-md bg-white p-3 text-sm text-muted">{empty}</div> : null;
  return (
    <div className="mt-3 grid gap-2">
      {items.map((todo) => (
        <div id={`todo-${todo.id}`} className="scroll-mt-24 grid gap-2 rounded-md bg-white p-3 text-sm sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center" key={todo.id}>
          <input
            aria-label={todo.completedAt ? "Als offen markieren" : "Als erledigt markieren"}
            checked={Boolean(todo.completedAt)}
            onChange={(event) => onToggle(todo.id, event.currentTarget.checked)}
            type="checkbox"
          />
          <span className={todo.completedAt ? "text-muted line-through" : "font-semibold"}>
            {todo.title}
            {todo.dueDate ? <span className="ml-2 text-xs font-normal text-muted">faellig {new Intl.DateTimeFormat("de-DE").format(new Date(todo.dueDate))}</span> : null}
          </span>
          <button className="button-secondary px-3 py-2 text-sm" onClick={() => onDelete(todo.id)} type="button">Loeschen</button>
        </div>
      ))}
    </div>
  );
}
