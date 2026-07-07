"use client";

import { useMemo, useState } from "react";
import { roleLabel } from "@/lib/display";

type RoleName = "ADMIN" | "BROKER" | "TENANT" | "TAX_ADVISOR";

export type ShareUserOption = {
  id: string;
  label: string;
  detail: string;
  role: RoleName;
};

export type DocumentPermissionView = {
  id: string;
  userId: string;
  canView: boolean;
  canDownload: boolean;
  user?: {
    id: string;
    email: string;
    username: string | null;
    name: string | null;
    role: RoleName;
  } | null;
};

export function DocumentPermissionEditor({
  documentId,
  users,
  initialPermissions
}: {
  documentId: string;
  users: ShareUserOption[];
  initialPermissions: DocumentPermissionView[];
}) {
  const [permissions, setPermissions] = useState(initialPermissions);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const activePermissions = permissions.filter((permission) => permission.canView);
  const defaultUserId = users.find((user) => !activePermissions.some((permission) => permission.userId === user.id))?.id || users[0]?.id || "";
  const userById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    await updatePermission({
      userId: String(form.get("userId") || ""),
      canView: form.get("canView") === "on",
      canDownload: form.get("canDownload") === "on"
    });
  }

  async function revoke(userId: string) {
    await updatePermission({ userId, canView: false, canDownload: false });
  }

  async function updatePermission(input: { userId: string; canView: boolean; canDownload: boolean }) {
    if (!input.userId) {
      setMessage("Bitte Benutzer auswählen.");
      return;
    }
    setBusy(true);
    const response = await fetch("/api/permissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId, ...input })
    });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Freigabe konnte nicht gespeichert werden." }));
      setMessage(body.error || "Freigabe konnte nicht gespeichert werden.");
      return;
    }
    const permission = await response.json();
    setPermissions((current) => {
      const user = userById.get(input.userId);
      const normalized = {
        ...permission,
        user: permission.user || (user ? { id: user.id, email: user.detail, username: null, name: user.label, role: user.role } : null)
      };
      const exists = current.some((item) => item.userId === input.userId);
      return exists ? current.map((item) => item.userId === input.userId ? normalized : item) : [...current, normalized];
    });
    setMessage(input.canView ? "Freigabe gespeichert." : "Freigabe entfernt.");
  }

  return (
    <details className="mt-3 rounded-md border border-line bg-panel p-3">
      <summary className="cursor-pointer list-none text-xs font-bold text-muted [&::-webkit-details-marker]:hidden">
        Dokumentfreigaben ({activePermissions.length})
      </summary>
      <div className="mt-3 grid gap-3">
        {activePermissions.length ? (
          <div className="grid gap-2">
            {activePermissions.map((permission) => {
              const label = permission.user?.name || permission.user?.username || permission.user?.email || "Benutzer";
              return (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white p-2 text-xs" key={permission.userId}>
                  <div>
                    <div className="font-bold">{label}</div>
                    <div className="text-muted">{roleLabel(permission.user?.role || userById.get(permission.userId)?.role || "TENANT")} · {permission.canDownload ? "Download erlaubt" : "nur ansehen"}</div>
                  </div>
                  <button className="button-secondary px-2 py-1 text-xs" disabled={busy} onClick={() => revoke(permission.userId)} type="button">Entziehen</button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-md bg-white p-2 text-xs text-muted">Noch keine einzelne Freigabe.</div>
        )}
        <form className="grid gap-2 rounded-md bg-white p-2 text-xs" onSubmit={save}>
          <label className="grid gap-1 font-semibold text-muted">
            Benutzer
            <select className="text-sm" name="userId" defaultValue={defaultUserId}>
              {users.map((user) => (
                <option key={user.id} value={user.id}>{roleLabel(user.role)} · {user.label}</option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2 font-semibold text-muted">
              <input name="canView" type="checkbox" defaultChecked />
              ansehen
            </label>
            <label className="flex items-center gap-2 font-semibold text-muted">
              <input name="canDownload" type="checkbox" defaultChecked />
              herunterladen
            </label>
          </div>
          {message ? <div className="text-muted">{message}</div> : null}
          <button className="px-3 py-2 text-sm" disabled={busy || !users.length} type="submit">{busy ? "Speichert..." : "Freigabe speichern"}</button>
        </form>
      </div>
    </details>
  );
}
