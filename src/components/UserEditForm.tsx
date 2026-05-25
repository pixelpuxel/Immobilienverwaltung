"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type RoleName = "ADMIN" | "BROKER" | "TENANT";

export function UserEditForm({
  user,
  currentUserId
}: {
  user: {
    id: string;
    email: string;
    username: string | null;
    name: string | null;
    role: RoleName;
    active: boolean;
    contactPerson: string | null;
    contactAddress: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
  };
  currentUserId: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const isOwnUser = user.id === currentUserId;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "").trim();
    const payload = {
      name: String(form.get("name") || ""),
      username: String(form.get("username") || ""),
      email: String(form.get("email") || ""),
      role: isOwnUser ? user.role : String(form.get("role") || user.role),
      active: isOwnUser ? user.active : form.get("active") === "on",
      password,
      contactPerson: String(form.get("contactPerson") || ""),
      contactAddress: String(form.get("contactAddress") || ""),
      contactPhone: String(form.get("contactPhone") || ""),
      contactEmail: String(form.get("contactEmail") || "")
    };

    const response = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Benutzer konnte nicht gespeichert werden." }));
      setMessage(body.error || "Benutzer konnte nicht gespeichert werden.");
      return;
    }
    const passwordInput = event.currentTarget.elements.namedItem("password") as HTMLInputElement | null;
    if (passwordInput) passwordInput.value = "";
    setMessage(password ? "Benutzer und Passwort gespeichert." : "Benutzer gespeichert.");
    router.refresh();
  }

  return (
    <details className="mt-3 rounded-md border border-line bg-white p-3">
      <summary className="cursor-pointer text-sm font-semibold">Benutzer bearbeiten</summary>
      <form className="mt-3 grid gap-2 text-xs" onSubmit={save}>
        <label className="grid gap-1 font-semibold text-muted">
          Name
          <input className="text-sm" name="name" defaultValue={user.name || ""} />
        </label>
        <label className="grid gap-1 font-semibold text-muted">
          Benutzername
          <input className="text-sm" name="username" defaultValue={user.username || ""} />
        </label>
        <label className="grid gap-1 font-semibold text-muted">
          E-Mail
          <input className="text-sm" name="email" type="email" defaultValue={user.email} required />
        </label>
        <label className="grid gap-1 font-semibold text-muted">
          Rolle
          <select className="text-sm" name="role" defaultValue={user.role} disabled={isOwnUser}>
            <option value="ADMIN">Eigentümer</option>
            <option value="BROKER">Makler</option>
            <option value="TENANT">Mieter</option>
          </select>
        </label>
        <label className="flex items-center gap-2 font-semibold text-muted">
          <input name="active" type="checkbox" defaultChecked={user.active} disabled={isOwnUser} />
          aktiv
        </label>
        <label className="grid gap-1 font-semibold text-muted">
          Neues Passwort
          <input className="text-sm" name="password" type="text" placeholder="Leer lassen, wenn unverändert" minLength={8} />
        </label>
        <label className="grid gap-1 font-semibold text-muted">
          Kontaktperson
          <input className="text-sm" name="contactPerson" defaultValue={user.contactPerson || ""} />
        </label>
        <label className="grid gap-1 font-semibold text-muted">
          Kontakt-E-Mail
          <input className="text-sm" name="contactEmail" type="email" defaultValue={user.contactEmail || ""} />
        </label>
        <label className="grid gap-1 font-semibold text-muted">
          Telefon
          <input className="text-sm" name="contactPhone" defaultValue={user.contactPhone || ""} />
        </label>
        <label className="grid gap-1 font-semibold text-muted">
          Adresse
          <textarea className="text-sm" name="contactAddress" rows={2} defaultValue={user.contactAddress || ""} />
        </label>
        {message ? <div className="rounded-md bg-panel p-2 text-muted">{message}</div> : null}
        <button className="px-3 py-2 text-sm" type="submit" disabled={busy}>
          {busy ? "Speichert..." : "Benutzer speichern"}
        </button>
      </form>
    </details>
  );
}
