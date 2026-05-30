"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { reloadCurrentView } from "@/lib/client-refresh";

export function PropertyImageUpload({ propertyId, hasPrimaryImage }: { propertyId: string; hasPrimaryImage: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    const files = data.getAll("files").filter((file): file is File => file instanceof File && file.size > 0);
    if (!files.length) {
      setBusy(false);
      setMessage("Bitte mindestens ein Bild auswaehlen.");
      return;
    }

    for (const [index, file] of files.entries()) {
      const upload = new FormData();
      upload.set("file", file);
      upload.set("title", file.name);
      upload.set("propertyId", propertyId);
      upload.set("scope", "PROPERTY");
      upload.set("isPropertyImage", "true");
      upload.set("isPrimaryImage", !hasPrimaryImage && index === 0 ? "true" : "false");
      const response = await fetch("/api/documents", { method: "POST", body: upload });
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: "Bild-Upload fehlgeschlagen." }));
        setBusy(false);
        setMessage(body.error || "Bild-Upload fehlgeschlagen.");
        return;
      }
    }

    form.reset();
    setBusy(false);
    setMessage(files.length === 1 ? "Bild hochgeladen." : `${files.length} Bilder hochgeladen.`);
    reloadCurrentView(router);
  }

  return (
    <form className="grid gap-3 rounded-lg border border-dashed border-line bg-panel p-4" onSubmit={submit}>
      {message ? <div className="rounded-md border border-line bg-white p-3 text-sm">{message}</div> : null}
      <label className="grid min-h-28 place-items-center rounded-md border border-dashed border-line bg-white p-4 text-center text-sm font-semibold">
        Objektbilder auswaehlen oder hineinziehen
        <input accept="image/jpeg,image/png,image/webp" className="mt-3" multiple name="files" type="file" />
      </label>
      <button type="submit" disabled={busy}>{busy ? "Bilder werden hochgeladen..." : "Bilder hochladen"}</button>
    </form>
  );
}
