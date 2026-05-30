"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { refreshCurrentView } from "@/lib/client-refresh";

type OwnerProfile = {
  name: string | null;
  contactPerson: string | null;
  contactAddress: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  ownerBankName: string | null;
  ownerIban: string | null;
  ownerTaxId: string | null;
  ownerNotes: string | null;
};

export function OwnerProfileForm({ userId, profile }: { userId: string; profile: OwnerProfile }) {
  const router = useRouter();
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const payload = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(body.error || "Eigentümerdaten konnten nicht gespeichert werden.");
      return;
    }
    setMessage("Eigentümerdaten gespeichert.");
    refreshCurrentView(router);
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-lg border border-line bg-panel p-4">
      {message ? <div className="rounded-md border border-line bg-white p-3 text-sm">{message}</div> : null}
      <h2 className="text-xl font-bold">Eigentümerprofil</h2>
      <p className="text-sm text-muted">Diese Daten werden für Kontakt, Verkaufsvorbereitung, Wohnungsgeberbestätigung und Vertragsvorlagen genutzt.</p>
      <label>Anzeigename<input name="name" defaultValue={profile.name || ""} /></label>
      <label>Kontaktperson / Vertragspartei<input name="contactPerson" defaultValue={profile.contactPerson || ""} /></label>
      <label>Anschrift<textarea name="contactAddress" rows={3} defaultValue={profile.contactAddress || ""} /></label>
      <label>Telefon<input name="contactPhone" defaultValue={profile.contactPhone || ""} /></label>
      <label>Kontakt-E-Mail<input name="contactEmail" type="email" defaultValue={profile.contactEmail || ""} /></label>
      <label>Bank<input name="ownerBankName" defaultValue={profile.ownerBankName || ""} /></label>
      <label>IBAN<input name="ownerIban" defaultValue={profile.ownerIban || ""} /></label>
      <label>Steuer-ID / USt-ID<input name="ownerTaxId" defaultValue={profile.ownerTaxId || ""} /></label>
      <label>Notizen für Verkauf und Verträge<textarea name="ownerNotes" rows={4} defaultValue={profile.ownerNotes || ""} /></label>
      <button type="submit">Eigentümerdaten speichern</button>
    </form>
  );
}
