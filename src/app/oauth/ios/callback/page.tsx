export default function IOSOAuthCallbackPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f8f5] p-5 text-ink">
      <section className="w-full max-w-md rounded-lg border border-line bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-black uppercase tracking-normal text-accent">MCP Explorer</p>
        <h1 className="mt-2 text-2xl font-black">Zur App zurückkehren</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Die Anmeldung wurde abgeschlossen. Öffne MCP Explorer erneut, falls die App nicht automatisch in den Vordergrund wechselt.
        </p>
      </section>
    </main>
  );
}
