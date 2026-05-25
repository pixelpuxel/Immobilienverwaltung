"use client";

import { useEffect, useState } from "react";
import { roleLabel } from "@/lib/display";

type RoleName = "ADMIN" | "BROKER" | "TENANT";
type SwitchUser = {
  id: string;
  email: string;
  username: string | null;
  name: string | null;
  role: RoleName;
  context: string;
};

export function ViewSwitcher({ currentUserId, compact = false }: { currentUserId: string; compact?: boolean }) {
  const [users, setUsers] = useState<SwitchUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState(currentUserId);
  const [busy, setBusy] = useState(false);
  const currentUser = users.find((user) => user.id === currentUserId);

  useEffect(() => {
    let cancelled = false;
    setSelectedUserId(currentUserId);
    fetch("/api/auth/switch-view", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : { users: [] })
      .then((body) => {
        if (!cancelled) setUsers(body.users || []);
      })
      .catch(() => {
        if (!cancelled) setUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  async function switchUser(userId: string) {
    if (userId === currentUserId || busy) return;
    setBusy(true);
    const response = await fetch("/api/auth/switch-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId })
    });
    setBusy(false);
    if (response.ok) {
      window.location.href = "/dashboard";
    }
  }

  const select = (
    <select
      aria-label="Benutzeransicht auswaehlen"
      className={compact ? "h-10 w-full min-w-0 max-w-[180px] rounded-md bg-white px-2 text-xs" : "min-w-0 text-xs"}
      value={selectedUserId}
      disabled={busy || users.length === 0}
      onChange={(event) => {
        const userId = event.target.value;
        setSelectedUserId(userId);
        switchUser(userId);
      }}
    >
      {users.map((user) => (
        <option key={user.id} value={user.id}>
          {roleLabel(user.role)} - {user.name || user.username || user.email}{user.context ? ` (${user.context})` : ""}
        </option>
      ))}
    </select>
  );

  if (compact) {
    return (
      <div className="min-w-0">
        <div className="sr-only">Benutzeransicht</div>
        {select}
      </div>
    );
  }

  return (
    <div className="grid gap-2 rounded-md border border-line bg-white p-2">
      <div>
        <div className="px-1 text-xs font-semibold text-muted">Benutzeransicht</div>
        {currentUser ? (
          <div className="mt-1 truncate px-1 text-xs">
            {roleLabel(currentUser.role)}: {currentUser.name || currentUser.username || currentUser.email}
          </div>
        ) : null}
      </div>
      {select}
      {busy ? <div className="px-1 text-xs text-muted">Wechsle Ansicht...</div> : null}
    </div>
  );
}
