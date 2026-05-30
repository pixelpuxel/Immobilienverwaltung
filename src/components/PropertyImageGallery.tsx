"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { reloadCurrentView } from "@/lib/client-refresh";

type PropertyImage = {
  id: string;
  title: string;
  isPrimaryImage: boolean;
};

export function PropertyImageGallery({ images, canEdit }: { images: PropertyImage[]; canEdit: boolean }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function makePrimary(id: string) {
    setBusyId(id);
    const response = await fetch(`/api/documents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPrimaryImage: true })
    });
    setBusyId(null);
    if (response.ok) reloadCurrentView(router);
  }

  async function removeImage(id: string) {
    if (!window.confirm("Bild wirklich loeschen?")) return;
    setBusyId(id);
    const response = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    setBusyId(null);
    if (response.ok) reloadCurrentView(router);
  }

  if (!images.length) {
    return <div className="rounded-md bg-panel p-4 text-sm text-muted">Noch keine Objektbilder vorhanden.</div>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {images.map((image) => (
        <figure className="overflow-hidden rounded-lg border border-line bg-white shadow-sm" key={image.id}>
          <a href={`/api/documents/${image.id}/preview`} target="_blank" rel="noreferrer">
            <img className="aspect-[4/3] w-full object-cover" src={`/api/documents/${image.id}/preview`} alt={image.title} loading="lazy" />
          </a>
          <figcaption className="grid gap-3 p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-bold">{image.title}</div>
                {image.isPrimaryImage ? <div className="mt-1 text-xs font-semibold text-accent">Hauptbild</div> : null}
              </div>
            </div>
            {canEdit ? (
              <div className="flex flex-wrap gap-2">
                {!image.isPrimaryImage ? <button className="button-secondary px-3 py-2 text-sm" type="button" disabled={busyId === image.id} onClick={() => makePrimary(image.id)}>Als Hauptbild</button> : null}
                <button className="button-secondary px-3 py-2 text-sm" type="button" disabled={busyId === image.id} onClick={() => removeImage(image.id)}>Loeschen</button>
              </div>
            ) : null}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
