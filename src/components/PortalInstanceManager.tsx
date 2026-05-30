"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { refreshCurrentView } from "@/lib/client-refresh";

type Instance = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  users: Array<{ id: string; email: string; username: string | null; name: string | null }>;
  _count: { users: number; properties: number; documents: number; templates: number };
};

export function PortalInstanceManager() {
  const router = useRouter();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    const response = await fetch("/api/portal-instances", { cache: "no-store" });
    if (response.ok) setInstances(await response.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(formData: FormData) {
    setLoading(true);
    setMessage("");
    const response = await fetch("/api/portal-instances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(formData.entries()))
    });
    const data = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setMessage(data.error || "Instanz konnte nicht angelegt werden.");
      return;
    }
    setMessage("Neue Portal-Instanz wurde angelegt.");
    await load();
    refreshCurrentView(router);
  }

  async function switchToOwner(userId?: string) {
    if (!userId) {
      setMessage("Diese Instanz hat noch keinen aktiven Eigentümerzugang.");
      return;
    }
    setLoading(true);
    setMessage("");
    const response = await fetch("/api/auth/switch-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, instanceSwitch: true })
    });
    setLoading(false);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setMessage(data.error || "Ansicht konnte nicht gewechselt werden.");
      return;
    }
    window.location.href = "/dashboard";
  }

  return (
    <section className="rounded-lg border border-line bg-panel">
      <div className="border-b border-line p-4">
        <div className="font-bold">Portal-Instanzen</div>
        <p className="mt-1 text-sm text-muted">Für andere Nutzer legst du hier eine eigene, leere Instanz mit eigenem Eigentümerzugang an. Die Daten bleiben voneinander getrennt.</p>
      </div>
      <div className="grid gap-3 p-4">
        {instances.map((instance) => (
          <div className="rounded-md border border-line bg-background p-3 text-sm" key={instance.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong>{instance.name}</strong>
              <span className="rounded-full bg-accent/10 px-2 py-1 text-xs font-semibold text-accent">{instance.slug}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted">
              <span>{instance._count.users} Benutzer</span>
              <span>{instance._count.properties} Immobilien</span>
              <span>{instance._count.documents} Dokumente</span>
              <span>{instance._count.templates} Vorlagen</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button className="button-secondary px-3 py-2 text-xs" type="button" onClick={() => switchToOwner(instance.users[0]?.id)} disabled={loading}>
                In Instanz wechseln
              </button>
              {instance.users[0] ? (
                <span className="text-xs text-muted">als {instance.users[0].username ? `@${instance.users[0].username}` : instance.users[0].email}</span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <form action={submit} className="grid gap-3 border-t border-line p-4">
        <h3 className="text-lg font-bold">Neue Instanz anlegen</h3>
        <label>Name der Instanz<input name="name" placeholder="Immobilienportal Musterkunde" /></label>
        <label>Kuerzel<input name="slug" placeholder="wird automatisch erzeugt" /></label>
        <label>Eigentümer Name<input name="ownerName" /></label>
        <label>Eigentümer E-Mail<input name="ownerEmail" type="email" placeholder="optional" /></label>
        <label>Eigentümer Benutzername<input name="ownerUsername" /></label>
        <label>Start-Passwort<input name="ownerPassword" type="text" defaultValue="BitteSofortAendern123!" /></label>
        <button className="button primary" disabled={loading}>{loading ? "Wird angelegt..." : "Instanz anlegen"}</button>
        {message ? <p className="text-sm text-muted">{message}</p> : null}
      </form>
    </section>
  );
}
