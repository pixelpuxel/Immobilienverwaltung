import Link from "next/link";
import { isShareExpired } from "@/lib/public-shares";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PublicSharePage({ params }: { params: { slug: string } }) {
  const share = await prisma.publicShare.findUnique({
    where: { slug: params.slug },
    include: { files: { orderBy: { createdAt: "asc" } } }
  });
  if (!share || isShareExpired(share)) {
    return (
      <main className="grid min-h-screen place-items-center bg-panel p-6">
        <section className="w-full max-w-xl rounded-lg border border-line bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold">Freigabe nicht verfügbar</h1>
          <p className="mt-2 text-muted">Der Link ist abgelaufen, wurde deaktiviert oder existiert nicht.</p>
        </section>
      </main>
    );
  }
  return (
    <main className="min-h-screen bg-panel p-6">
      <section className="mx-auto max-w-3xl overflow-hidden rounded-lg border border-line bg-white shadow-sm">
        <div className="border-b border-line bg-gradient-to-r from-emerald-50 via-white to-sky-50 p-6">
          <div className="text-sm font-bold uppercase tracking-wide text-accent">Geschützte Dateifreigabe</div>
          <h1 className="mt-2 text-3xl font-bold">{share.name}</h1>
          {share.description ? <p className="mt-3 whitespace-pre-wrap text-muted">{share.description}</p> : null}
          {share.expiresAt ? <p className="mt-3 text-sm text-muted">Gültig bis {new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(share.expiresAt)}</p> : null}
        </div>
        <div className="divide-y divide-line">
          {share.files.map((file) => (
            <div className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto]" key={file.id}>
              <div>
                <div className="break-words font-bold">{file.filename}</div>
                <div className="text-sm text-muted">{formatBytes(file.size)}</div>
              </div>
              <Link className="button px-4 py-2 text-center" href={`/api/public-shares/public/${params.slug}/files/${file.id}`}>Herunterladen</Link>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function formatBytes(value: number) {
  if (value > 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value > 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}
