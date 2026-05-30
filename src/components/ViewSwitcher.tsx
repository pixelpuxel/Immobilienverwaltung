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
      className={compact ? "h-10 w-full min-w-0 max-w-[190px] rounded-md bg-white px-2 text-xs" : "min-w-0 text-xs"}
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
          {viewOptionLabel(user)}
        </option>
      ))}
    </select>
  );

  if (compact) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <div className="sr-only">Benutzeransicht</div>
        {currentUser ? <RoleBadge role={currentUser.role} compact /> : null}
        {select}
      </div>
    );
  }

  return (
    <div className="grid gap-2 rounded-md border border-line bg-white p-2">
      <div className="flex items-center gap-2">
        {currentUser ? <RoleBadge role={currentUser.role} /> : null}
        {currentUser ? (
          <div className="min-w-0">
            <div className="text-xs font-semibold text-muted">Benutzeransicht</div>
            <div className="mt-0.5 truncate text-sm font-semibold">{viewTitle(currentUser)}</div>
          </div>
        ) : null}
      </div>
      {select}
      {busy ? <div className="px-1 text-xs text-muted">Wechsle Ansicht...</div> : null}
    </div>
  );
}

function viewTitle(user: SwitchUser) {
  const label = roleLabel(user.role);
  const name = user.name || user.username || user.email;
  return isSameLabel(name, label) ? label : name;
}

function viewOptionLabel(user: SwitchUser) {
  const label = roleLabel(user.role);
  const title = viewTitle(user);
  const identity = user.username ? `@${user.username}` : user.email;
  const titleWithIdentity = isSameLabel(title, label) ? `${label} (${identity})` : `${label}: ${title}`;
  return user.context ? `${titleWithIdentity} (${user.context})` : titleWithIdentity;
}

function isSameLabel(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function RoleBadge({ role, compact = false }: { role: RoleName; compact?: boolean }) {
  const config = roleConfig[role];
  return (
    <span
      aria-hidden="true"
      className={`${compact ? "h-7 w-7 text-[11px]" : "h-9 w-9 text-sm"} grid shrink-0 place-items-center rounded-md bg-gradient-to-br ${config.tone} font-black text-white shadow-sm`}
      title={config.label}
    >
      {config.initial}
    </span>
  );
}

const roleConfig: Record<RoleName, { label: string; initial: string; tone: string }> = {
  ADMIN: { label: "Eigentümer", initial: "E", tone: "from-emerald-500 to-teal-700" },
  BROKER: { label: "Makler", initial: "M", tone: "from-sky-500 to-blue-700" },
  TENANT: { label: "Mieter", initial: "T", tone: "from-amber-400 to-orange-600" }
};
