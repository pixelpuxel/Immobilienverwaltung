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
  group?: string;
  isCurrent?: boolean | null;
};

export function ViewSwitcher({ currentUserId, compact = false }: { currentUserId: string; compact?: boolean }) {
  const [users, setUsers] = useState<SwitchUser[]>([]);
  const [adminId, setAdminId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const currentUser = users.find((user) => user.id === currentUserId);
  const groupedUsers = groupUsers(users);
  const isImpersonating = Boolean(adminId && currentUserId !== adminId);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/switch-view", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : { users: [] })
      .then((body) => {
        if (!cancelled) {
          setUsers(body.users || []);
          setAdminId(body.adminId || null);
        }
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
    if (response.ok) window.location.href = "/dashboard";
  }

  return (
    <div className={compact ? "relative min-w-0" : "grid gap-2 rounded-md border border-line bg-white p-2"}>
      {isImpersonating && adminId ? (
        <button className="mb-2 w-full rounded-md bg-amber-100 px-3 py-2 text-xs font-bold text-amber-900" disabled={busy} type="button" onClick={() => switchUser(adminId)}>
          Zurück zur Admin-Ansicht
        </button>
      ) : null}
      <details className="relative">
        <summary className={`flex cursor-pointer list-none items-center gap-2 rounded-md border border-line bg-white px-2 py-2 [&::-webkit-details-marker]:hidden ${compact ? "max-w-[210px]" : ""}`}>
          {currentUser ? <RoleBadge role={currentUser.role} compact={compact} /> : null}
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold text-muted">Benutzeransicht</span>
            <span className="block truncate text-sm font-bold">{currentUser ? viewTitle(currentUser) : "Lade ..."}</span>
          </span>
        </summary>
        <div className={`${compact ? "absolute right-0 z-50 mt-2 max-h-[70vh] w-[min(22rem,90vw)] overflow-auto" : "mt-2"} rounded-md border border-line bg-white p-2 shadow-xl`}>
          {groupedUsers.map((group) => (
            <div className="border-b border-line py-2 last:border-b-0" key={group.label}>
              <div className="px-2 text-xs font-bold uppercase text-muted">{group.label}</div>
              <div className="mt-1 grid gap-1">
                {group.users.map((user) => (
                  <div className="grid gap-2 rounded-md bg-panel p-2 text-sm" key={user.id}>
                    <div className="flex items-start gap-2">
                      <RoleBadge role={user.role} compact />
                      <div className="min-w-0">
                        <div className="font-bold">{viewTitle(user)}</div>
                        <div className="truncate text-xs text-muted">{user.context || user.username || user.email}</div>
                      </div>
                    </div>
                    <button className="button-secondary px-3 py-2 text-xs" disabled={busy || user.id === currentUserId} onClick={() => switchUser(user.id)} type="button">
                      {user.id === currentUserId ? "Aktuelle Ansicht" : "In diese Ansicht wechseln"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {busy ? <div className="px-2 py-1 text-xs text-muted">Wechsle Ansicht...</div> : null}
        </div>
      </details>
    </div>
  );
}

function viewTitle(user: SwitchUser) {
  const label = roleLabel(user.role);
  const name = user.name || user.username || user.email;
  return isSameLabel(name, label) ? label : name;
}

function groupUsers(users: SwitchUser[]) {
  const groups: Array<{ label: string; users: SwitchUser[] }> = [];
  for (const user of users) {
    const label = user.group || roleLabel(user.role);
    let group = groups.find((item) => item.label === label);
    if (!group) {
      group = { label, users: [] };
      groups.push(group);
    }
    group.users.push(user);
  }
  return groups;
}

function isSameLabel(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function RoleBadge({ role, compact = false }: { role: RoleName; compact?: boolean }) {
  const config = roleConfig[role];
  return (
    <span className={`${compact ? "h-7 w-7 text-[11px]" : "h-9 w-9 text-sm"} grid shrink-0 place-items-center rounded-md bg-gradient-to-br ${config.tone} font-black text-white shadow-sm`} title={config.label}>
      {config.icon}
    </span>
  );
}

const roleConfig: Record<RoleName, { label: string; icon: string; tone: string }> = {
  ADMIN: { label: "Eigentümer", icon: "🏠", tone: "from-emerald-500 to-teal-700" },
  BROKER: { label: "Makler", icon: "💼", tone: "from-sky-500 to-blue-700" },
  TENANT: { label: "Mieter", icon: "🔑", tone: "from-amber-400 to-orange-600" }
};
