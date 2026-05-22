"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type RoleName = "ADMIN" | "BROKER" | "TENANT";
type SwitchUser = {
  id: string;
  email: string;
  name: string | null;
  role: RoleName;
  context: string;
};

const labels: Record<RoleName, string> = {
  ADMIN: "Admin",
  BROKER: "Makler",
  TENANT: "Mieter"
};

export function ViewSwitcher({ currentUserId }: { currentUserId: string }) {
  const router = useRouter();
  const [users, setUsers] = useState<SwitchUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState(currentUserId);
  const [busy, setBusy] = useState(false);
  const currentUser = users.find((user) => user.id === currentUserId);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/switch-view")
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
  }, []);

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
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <div className="grid gap-2 rounded-md border border-line bg-white p-2">
      <div>
        <div className="px-1 text-xs font-semibold text-muted">Benutzeransicht</div>
        {currentUser ? (
          <div className="mt-1 truncate px-1 text-xs">
            {labels[currentUser.role]}: {currentUser.name || currentUser.email}
          </div>
        ) : null}
      </div>
      <select
        aria-label="Benutzeransicht auswaehlen"
        className="min-w-0 text-xs"
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
            {labels[user.role]} - {user.name || user.email}{user.context ? ` (${user.context})` : ""}
          </option>
        ))}
      </select>
      {busy ? <div className="px-1 text-xs text-muted">Wechsle Ansicht...</div> : null}
    </div>
  );
}
