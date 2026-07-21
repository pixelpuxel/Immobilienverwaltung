import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  clientDisplayName,
  isAllowedChatGptRedirect,
  isChatGptClientUrl,
  normalizeScopes,
  oauthResource,
  safeInternalNextPath
} from "@/lib/oauth";

type AuthorizePageProps = {
  searchParams: Record<string, string | string[] | undefined>;
};

export default async function OAuthAuthorizePage({ searchParams }: AuthorizePageProps) {
  const nextPath = `/oauth/authorize?${new URLSearchParams(flattenSearchParams(searchParams)).toString()}`;
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(safeInternalNextPath(nextPath))}`);

  const responseType = single(searchParams.response_type);
  const clientId = single(searchParams.client_id);
  const redirectUri = single(searchParams.redirect_uri);
  const state = single(searchParams.state);
  const scope = single(searchParams.scope);
  const codeChallenge = single(searchParams.code_challenge);
  const codeChallengeMethod = single(searchParams.code_challenge_method);
  const resource = single(searchParams.resource) || oauthResource();

  const validationError = validateAuthorizeRequest({ responseType, clientId, redirectUri, codeChallenge, codeChallengeMethod, resource });
  if (validationError) {
    return <OAuthError message={validationError} />;
  }

  let client = await prisma.oAuthClient.findUnique({ where: { clientId } });
  if (!client && isChatGptClientUrl(clientId) && isAllowedChatGptRedirect(redirectUri)) {
    client = await prisma.oAuthClient.create({
      data: {
        clientId,
        clientName: "ChatGPT",
        redirectUris: [redirectUri],
        clientUri: clientId
      }
    });
  }
  if (!client) return <OAuthError message="Unbekannter OAuth-Client. Bitte die Verbindung in ChatGPT erneut starten." />;
  if (!client.redirectUris.includes(redirectUri)) return <OAuthError message="Redirect-URI passt nicht zum OAuth-Client." />;

  const scopes = normalizeScopes(scope);
  const clientName = clientDisplayName(client.clientName, client.clientId);

  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f8f5] p-5 text-ink">
      <section className="w-full max-w-xl rounded-lg border border-line bg-white p-6 shadow-sm">
        <p className="text-sm font-black uppercase tracking-normal text-accent">OAuth-Verbindung</p>
        <h1 className="mt-2 text-3xl font-black">{clientName} verbinden</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Diese Verbindung erstellt einen widerrufbaren Portal-API-Token fuer den MCP-Zugriff. Der Zugriff laeuft mit deinen aktuellen Portalrechten.
        </p>
        <div className="mt-5 rounded-md bg-panel p-4">
          <div className="text-sm font-bold">Angeforderte Rechte</div>
          <ul className="mt-3 grid gap-2 text-sm text-muted">
            {scopes.map((item) => (
              <li key={item} className="rounded-md bg-white px-3 py-2">{scopeLabel(item)}</li>
            ))}
          </ul>
        </div>
        <form action="/oauth/authorize/confirm" className="mt-5 flex flex-wrap gap-3" method="post">
          <input name="client_id" type="hidden" value={clientId} />
          <input name="redirect_uri" type="hidden" value={redirectUri} />
          <input name="state" type="hidden" value={state} />
          <input name="scope" type="hidden" value={scopes.join(" ")} />
          <input name="code_challenge" type="hidden" value={codeChallenge} />
          <input name="code_challenge_method" type="hidden" value={codeChallengeMethod} />
          <input name="resource" type="hidden" value={resource} />
          <button className="button px-5 py-3" name="decision" type="submit" value="allow">Zugriff erlauben</button>
          <button className="button-secondary px-5 py-3" name="decision" type="submit" value="deny">Ablehnen</button>
        </form>
      </section>
    </main>
  );
}

function OAuthError({ message }: { message: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f8f5] p-5 text-ink">
      <section className="w-full max-w-xl rounded-lg border border-red-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-black uppercase tracking-normal text-red-700">OAuth-Fehler</p>
        <h1 className="mt-2 text-2xl font-black">Verbindung nicht moeglich</h1>
        <p className="mt-3 text-sm leading-6 text-muted">{message}</p>
      </section>
    </main>
  );
}

function validateAuthorizeRequest(input: Record<string, string>) {
  if (input.responseType !== "code") return "response_type=code ist erforderlich.";
  if (!input.clientId) return "client_id fehlt.";
  if (!input.redirectUri) return "redirect_uri fehlt.";
  if (!input.codeChallenge) return "code_challenge fehlt.";
  if (input.codeChallengeMethod !== "S256") return "code_challenge_method=S256 ist erforderlich.";
  if (input.resource !== oauthResource()) return "resource passt nicht zu diesem MCP-Server.";
  return null;
}

function flattenSearchParams(params: Record<string, string | string[] | undefined>) {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) result[key] = single(value);
  return result;
}

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function scopeLabel(scope: string) {
  const labels: Record<string, string> = {
    "read:properties": "Immobilien lesen",
    "read:units": "Einheiten lesen",
    "read:documents": "Dokumente lesen",
    "download:documents": "Dokumente herunterladen",
    "read:tenants": "Mieter lesen",
    "read:contracts": "Vertraege lesen",
    "write:contracts": "Vertraege erzeugen",
    "write:landlord-confirmations": "Wohnungsgeberbestaetigungen erzeugen",
    "read:audit": "Aktivitaeten lesen"
  };
  return labels[scope] || scope;
}
