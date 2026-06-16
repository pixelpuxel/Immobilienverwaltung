import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { readAgentRegressionTests, writeAgentRegressionTests } from "@/lib/agent-regression-tests";
import { processAgentMessage } from "@/lib/agent";

const payloadSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), data: z.unknown() }),
  z.object({ action: z.literal("run"), caseId: z.string().min(1), prompt: z.string().trim().min(1) }),
  z.object({
    action: z.literal("rate"),
    caseId: z.string().min(1),
    satisfactory: z.boolean(),
    status: z.string().trim().min(1).default("reviewed"),
    notes: z.string().trim().optional().default("")
  })
]);

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  return NextResponse.json(await readAgentRegressionTests());
}

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz: ungueltiger Ursprung." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const parsed = payloadSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Bitte Eingaben pruefen." }, { status: 400 });
  if (parsed.data.action === "save") {
    return NextResponse.json(await writeAgentRegressionTests(parsed.data.data));
  }
  if (parsed.data.action === "rate") {
    const { caseId, satisfactory, status, notes } = parsed.data;
    const current = await readAgentRegressionTests();
    const cases = Array.isArray(current.cases) ? current.cases : [];
    const next = {
      ...current,
      cases: cases.map((item: RegressionCase) => item.id === caseId
        ? {
          ...item,
          status,
          lastRun: {
            ...(item.lastRun || {}),
            satisfactory,
            notes: notes || item.lastRun?.notes || ""
          }
        }
        : item)
    };
    return NextResponse.json(await writeAgentRegressionTests(next));
  }

  const { caseId, prompt } = parsed.data;
  const result = await processAgentMessage({
    user,
    message: prompt,
    channel: "web",
    externalKey: `regression:${caseId}`
  });
  const current = await readAgentRegressionTests();
  const cases = Array.isArray(current.cases) ? current.cases : [];
  const next = {
    ...current,
    cases: cases.map((item: RegressionCase) => item.id === caseId
      ? {
        ...item,
        status: "tested",
        lastRun: {
          at: new Date().toISOString(),
          environment: "manual-test",
          answer: result.answer,
          satisfactory: null,
          notes: "Manuell im Debugging-Bereich ausgefuehrt. Bitte Ergebnis fachlich bewerten."
        }
      }
      : item)
  };
  return NextResponse.json({ data: await writeAgentRegressionTests(next), result });
}

type RegressionCase = {
  id?: string;
  status?: string;
  lastRun?: {
    at?: string;
    environment?: string;
    answer?: string;
    satisfactory?: boolean | null;
    notes?: string;
  } | null;
};
