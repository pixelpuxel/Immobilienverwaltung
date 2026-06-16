import fs from "fs/promises";
import path from "path";
import { env } from "./env";

const bundledPath = path.join(process.cwd(), "src", "data", "agent-regression-tests.json");
const persistentPath = path.join(env.uploadPath, "agent-regression-tests.json");

export async function readAgentRegressionTests() {
  await ensurePersistentRegressionTests();
  const content = await fs.readFile(persistentPath, "utf8");
  return JSON.parse(content);
}

export async function writeAgentRegressionTests(data: unknown) {
  await fs.mkdir(path.dirname(persistentPath), { recursive: true });
  const normalized = {
    ...(typeof data === "object" && data !== null ? data : {}),
    updatedAt: new Date().toISOString()
  };
  await fs.writeFile(persistentPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

export async function recordAgentNoResultCase(input: {
  prompt: string;
  answer: string;
  channel?: string;
  area?: string;
}) {
  const current = await readAgentRegressionTests().catch(async () => JSON.parse(await fs.readFile(bundledPath, "utf8")));
  const cases = Array.isArray(current.cases) ? current.cases : [];
  const normalizedPrompt = input.prompt.trim().toLowerCase();
  if (!normalizedPrompt || cases.some((item: { prompt?: string }) => item.prompt?.trim().toLowerCase() === normalizedPrompt)) {
    return current;
  }
  const next = {
    ...current,
    cases: [
      {
        id: `auto-no-result-${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`,
        area: input.area || "Automatisch erkannt",
        prompt: input.prompt,
        expected: "Diese Anfrage fuehrte zu keiner Treffer-Antwort und soll fachlich geprueft werden.",
        status: "open",
        lastRun: {
          at: new Date().toISOString(),
          environment: input.channel || "agent",
          answer: input.answer,
          satisfactory: false,
          notes: "Automatisch aufgenommen, weil der Agent eine problematische Antwort geliefert hat."
        }
      },
      ...cases
    ]
  };
  return writeAgentRegressionTests(next);
}

async function ensurePersistentRegressionTests() {
  await fs.mkdir(path.dirname(persistentPath), { recursive: true });
  try {
    await fs.access(persistentPath);
  } catch {
    const bundled = await fs.readFile(bundledPath, "utf8");
    await fs.writeFile(persistentPath, bundled, "utf8");
  }
}
