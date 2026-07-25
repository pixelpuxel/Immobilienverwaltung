import Link from "next/link";

const supportEmail = process.env.APP_SUPPORT_EMAIL || "support@schreiber.info";

export default function MCPExplorerSupportPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-5 py-12 text-slate-100">
      <article className="mx-auto max-w-3xl rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl md:p-10">
        <p className="text-sm font-bold uppercase tracking-widest text-fuchsia-400">MCP Explorer Mobile</p>
        <h1 className="mt-3 text-4xl font-black">Support</h1>
        <p className="mt-4 text-lg leading-8 text-slate-300">
          MCP Explorer connects iPhone and iPad to remote Streamable HTTP MCP servers. It supports native OAuth
          with PKCE, bearer credentials, tools, resources, prompts, history, collections, and traffic inspection.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
            <h2 className="text-xl font-bold">Connection checklist</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-300">
              <li>Use the server&apos;s HTTPS Streamable HTTP endpoint.</li>
              <li>Select OAuth when the server advertises browser sign-in.</li>
              <li>Confirm that the server exposes at least one MCP capability.</li>
              <li>Use Refresh after the server configuration changes.</li>
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
            <h2 className="text-xl font-bold">Contact support</h2>
            <p className="mt-3 text-slate-300">
              Include the app version, iOS version, server domain, and the sanitized error message. Never send
              passwords, access tokens, private keys, or full device tokens.
            </p>
            <a
              className="mt-5 inline-flex rounded-xl bg-sky-500 px-4 py-3 font-bold text-slate-950"
              href={`mailto:${supportEmail}?subject=MCP%20Explorer%20Support`}
            >
              Email support
            </a>
          </section>
        </div>

        <div className="mt-10 border-t border-slate-800 pt-6">
          <Link className="font-bold text-sky-400 underline" href="/mcp-explorer/privacy">
            Privacy Policy
          </Link>
        </div>
      </article>
    </main>
  );
}
