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
  ownerSignaturePath?: string | null;
};

export function OwnerProfileForm({ userId, profile }: { userId: string; profile: OwnerProfile }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [signatureFile, setSignatureFile] = useState<File | null>(null);

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

  async function uploadSignature(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (!signatureFile) {
      setMessage("Bitte eine JPG-Datei auswählen.");
      return;
    }
    const formData = new FormData();
    formData.append("signature", signatureFile);
    const response = await fetch(`/api/users/${userId}/signature`, {
      method: "POST",
      body: formData
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(body.error || "Unterschrift konnte nicht gespeichert werden.");
      return;
    }
    setMessage("Unterschrift gespeichert.");
    refreshCurrentView(router);
  }

  return (
    <section className="grid gap-3 rounded-lg border border-line bg-panel p-4">
      {message ? <div className="rounded-md border border-line bg-white p-3 text-sm">{message}</div> : null}
      <h2 className="text-xl font-bold">Eigentümerprofil</h2>
      <p className="text-sm text-muted">Diese Daten werden für Kontakt, Verkaufsvorbereitung, Wohnungsgeberbestätigung und Vertragsvorlagen genutzt.</p>
      <form onSubmit={submit} className="grid gap-3">
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
      <div className="rounded-md border border-line bg-white p-3">
        <div className="text-sm font-bold">Unterschrift für Wohnungsgeberbestätigung</div>
        <p className="mt-1 text-xs text-muted">Bitte als JPG hochladen. Die Grafik wird unten im Formular eingefügt.</p>
        <form className="mt-3 grid gap-2" onSubmit={uploadSignature}>
          <input name="signature" type="file" accept="image/jpeg" required onChange={(event) => setSignatureFile(event.target.files?.[0] || null)} />
          <button className="button-secondary w-fit px-3 py-2 text-sm" type="submit">Unterschrift speichern</button>
        </form>
        {profile.ownerSignaturePath ? <div className="mt-2 text-xs font-semibold text-accent">Unterschrift ist hinterlegt.</div> : null}
      </div>
    </section>
  );
}
