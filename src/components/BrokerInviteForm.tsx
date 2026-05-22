"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type PropertyOption = { id: string; name: string };

export function BrokerInviteForm({ properties }: { properties: PropertyOption[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    const propertyIds = form.getAll("propertyIds").map(String);
    const propertyNames = properties.filter((property) => propertyIds.includes(property.id)).map((property) => property.name);
    const email = String(form.get("email") || "");
    if (!propertyIds.length) {
      setMessage("Bitte mindestens eine Immobilie auswaehlen.");
      return;
    }
    const confirmed = window.confirm(`Makler ${email} anlegen und fuer folgende Immobilien freischalten?\n\n${propertyNames.join("\n")}`);
    if (!confirmed) return;

    const response = await fetch("/api/broker-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        name: String(form.get("name") || ""),
        password: String(form.get("password") || ""),
        message: String(form.get("message") || ""),
        propertyIds
      })
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Makler konnte nicht angelegt werden." }));
      setMessage(body.error || "Makler konnte nicht angelegt werden.");
      return;
    }
    event.currentTarget.reset();
    setMessage("Makler angelegt und freigeschaltet.");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-lg border border-line bg-panel p-4">
      {message ? <div className="rounded-md border border-line bg-white p-3 text-sm">{message}</div> : null}
      <h2 className="text-xl font-bold">Makler einladen</h2>
      <label>E-Mail<input name="email" type="email" required /></label>
      <label>Name<input name="name" /></label>
      <label>Passwort<input name="password" type="text" defaultValue="BitteSofortAendern123!" /></label>
      <label>
        Immobilien
        <select className="min-h-36" name="propertyIds" multiple required>
          {properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
        </select>
      </label>
      <label>Notiz<textarea name="message" /></label>
      <button type="submit">Makler einladen</button>
    </form>
  );
}
