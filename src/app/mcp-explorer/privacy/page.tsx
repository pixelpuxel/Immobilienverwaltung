import Link from "next/link";

const supportEmail = process.env.APP_SUPPORT_EMAIL || "support@schreiber.info";

export default function MCPExplorerPrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-5 py-12 text-slate-100">
      <article className="mx-auto max-w-3xl rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl md:p-10">
        <p className="text-sm font-bold uppercase tracking-widest text-sky-400">MCP Explorer Mobile</p>
        <h1 className="mt-3 text-4xl font-black">Privacy Policy</h1>
        <p className="mt-3 text-sm text-slate-400">Effective: July 25, 2026</p>

        <div className="mt-8 space-y-7 leading-7 text-slate-200">
          <section>
            <h2 className="text-xl font-bold text-white">Overview</h2>
            <p className="mt-2">
              MCP Explorer is a native client for connecting to Model Context Protocol servers selected by the
              user. The app does not contain advertising, analytics SDKs, or cross-app tracking.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">Data stored on your device</h2>
            <p className="mt-2">
              Server configurations, sanitized request history, saved calls, collections, and JSON-RPC traffic
              are stored locally on your device. OAuth credentials and API tokens are stored in the iOS Keychain.
              Removing a server or signing out removes its credentials and server-specific cached data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">Connections to MCP servers</h2>
            <p className="mt-2">
              When you connect to or use an MCP server, the app sends the requests and data you choose directly
              to that server. The operator of each server is responsible for its own data processing and privacy
              practices. MCP Explorer does not send those requests to the app developer unless you explicitly
              connect to a server operated by the developer.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">Authentication</h2>
            <p className="mt-2">
              OAuth sign-in opens the authorization provider in an Apple authentication session. Access tokens
              are returned to the app and kept in Keychain. Credentials are not included in traffic logs,
              analytics, or URLs.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">Sharing and retention</h2>
            <p className="mt-2">
              The app developer does not sell personal data. Local records remain on your device until you
              delete the related server, clear the app, or remove the app. Data handled by a connected MCP
              server follows that server&apos;s retention policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">Contact</h2>
            <p className="mt-2">
              Questions about this policy can be sent to{" "}
              <a className="font-bold text-sky-400 underline" href={`mailto:${supportEmail}`}>
                {supportEmail}
              </a>
              .
            </p>
          </section>
        </div>

        <div className="mt-10 border-t border-slate-800 pt-6">
          <Link className="font-bold text-sky-400 underline" href="/mcp-explorer/support">
            MCP Explorer Support
          </Link>
        </div>
      </article>
    </main>
  );
}
