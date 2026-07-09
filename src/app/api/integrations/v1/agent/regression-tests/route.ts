import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { processAgentMessage } from "@/lib/agent";
import { readAgentRegressionTests, writeAgentRegressionTests } from "@/lib/agent-regression-tests";
import { integrationError, requireIntegrationUser } from "@/lib/integration-auth";

const payloadSchema = z.discriminatedUnion("action", [
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
  const { user, response } = await requireIntegrationUser(request);
  if (!user) return response;
  const forbidden = requireAdminPortalUser(user);
  if (forbidden) return forbidden;

  return NextResponse.json(await readAgentRegressionTests());
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["write:settings"]);
  if (!user) return response;
  const forbidden = requireAdminPortalUser(user);
  if (forbidden) return forbidden;

  const parsed = payloadSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return integrationError("BAD_REQUEST", "Bitte Eingaben pruefen.", 400);

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
          environment: "ios-test",
          answer: result.answer,
          satisfactory: null,
          notes: "In der nativen iOS-App ausgefuehrt. Bitte Ergebnis fachlich bewerten."
        }
      }
      : item)
  };
  return NextResponse.json({ data: await writeAgentRegressionTests(next), result });
}

function requireAdminPortalUser(user: { role: Role }) {
  if (user.role !== Role.ADMIN) {
    return integrationError("FORBIDDEN", "Dieser Endpunkt braucht einen Eigentuemer-Token.", 403);
  }
  return null;
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
