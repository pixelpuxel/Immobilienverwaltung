type AgentToolItem = {
  name: string;
  kind: "read" | "write" | "send";
  description: string;
  parameters: string;
  requiresConfirmation: boolean;
  availableForRole: boolean;
  examples: string[];
};

const kindLabels = {
  read: "Lesen",
  write: "Schreiben",
  send: "Senden"
};

const kindStyles = {
  read: "bg-emerald-50 text-emerald-800 border-emerald-200",
  write: "bg-amber-50 text-amber-800 border-amber-200",
  send: "bg-sky-50 text-sky-800 border-sky-200"
};

export function AgentToolOverview({ tools }: { tools: AgentToolItem[] }) {
  const available = tools.filter((tool) => tool.availableForRole);
  const unavailable = tools.filter((tool) => !tool.availableForRole);

  return (
    <section className="rounded-lg border border-line bg-white">
      <div className="border-b border-line p-4">
        <div className="font-bold">Agent-Tools</div>
        <p className="mt-1 text-sm text-muted">
          Diese Funktionen kennt der Portal-Agent aktuell. Web-Chat und Telegram nutzen diese Tool-Liste als technische Grundlage.
        </p>
      </div>
      <div className="grid gap-3 p-4">
        {available.map((tool) => (
          <details className="rounded-lg border border-line bg-panel p-3" key={tool.name}>
            <summary className="cursor-pointer">
              <div className="inline-flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-bold">{tool.name}</span>
                <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${kindStyles[tool.kind]}`}>{kindLabels[tool.kind]}</span>
                {tool.requiresConfirmation ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">vorsichtig</span> : null}
              </div>
            </summary>
            <div className="mt-3 grid gap-2 text-sm">
              <p className="text-muted">{tool.description}</p>
              <div>
                <div className="text-xs font-bold uppercase text-muted">Parameter</div>
                <code className="mt-1 block break-all rounded border border-line bg-white p-2 text-xs">{tool.parameters}</code>
              </div>
              {tool.examples.length ? (
                <div>
                  <div className="text-xs font-bold uppercase text-muted">Beispiele</div>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {tool.examples.map((example) => <li key={example}>{example}</li>)}
                  </ul>
                </div>
              ) : null}
            </div>
          </details>
        ))}
        {unavailable.length ? (
          <details className="rounded-lg border border-line p-3">
            <summary className="cursor-pointer font-semibold text-muted">Für diese Rolle nicht verfügbar</summary>
            <ul className="mt-2 list-disc pl-5 text-sm text-muted">
              {unavailable.map((tool) => <li key={tool.name}>{tool.name}: {tool.description}</li>)}
            </ul>
          </details>
        ) : null}
      </div>
    </section>
  );
}
