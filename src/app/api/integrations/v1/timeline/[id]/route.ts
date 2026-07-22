import { NextRequest, NextResponse } from "next/server";
import { integrationError, requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { prisma } from "@/lib/prisma";
import { deleteTimelineEvent, updateTimelineEvent } from "@/lib/timeline-actions";
import { serializeTimelineEvent, timelineAccessWhere, timelineInclude } from "@/lib/timeline";
import { timelineEventUpdateSchema } from "@/lib/timeline-schema";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request);
  if (!user) return response;
  if (!hasAnyScope(user.tokenScopes, ["read:timeline", "read:properties"])) return integrationError("FORBIDDEN", "Token braucht Scope: read:timeline oder read:properties", 403);
  const event = await prisma.timelineEvent.findFirst({
    where: { AND: [{ id: params.id }, await timelineAccessWhere(user, { includeInternal: request.nextUrl.searchParams.get("internal") === "1" })] },
    include: timelineInclude()
  });
  return event ? NextResponse.json(serializeTimelineEvent(event)) : integrationError("NOT_FOUND", "Timeline-Ereignis wurde nicht gefunden.", 404);
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request);
  if (!user) return response;
  if (!hasAnyScope(user.tokenScopes, ["write:timeline", "write:properties"])) return integrationError("FORBIDDEN", "Token braucht Scope: write:timeline oder write:properties", 403);
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;
  const body = timelineEventUpdateSchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return integrationError("BAD_REQUEST", "Bitte Timeline-Eingaben pruefen.", 400);
  try {
    const event = await updateTimelineEvent(user, params.id, body.data, request);
    return event ? NextResponse.json(event) : integrationError("NOT_FOUND", "Timeline-Ereignis wurde nicht gefunden.", 404);
  } catch (error) {
    return integrationError("BAD_REQUEST", timelineActionError(error), 400);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, response } = await requireIntegrationUser(request);
  if (!user) return response;
  if (!hasAnyScope(user.tokenScopes, ["write:timeline", "write:properties"])) return integrationError("FORBIDDEN", "Token braucht Scope: write:timeline oder write:properties", 403);
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;
  const ok = await deleteTimelineEvent(user, params.id, request);
  return ok ? NextResponse.json({ ok: true }) : integrationError("NOT_FOUND", "Timeline-Ereignis wurde nicht gefunden.", 404);
}

function hasAnyScope(tokenScopes: string[], scopes: string[]) {
  return scopes.some((scope) => tokenScopes.includes(scope));
}

function timelineActionError(error: unknown) {
  const code = error instanceof Error ? error.message : "UNKNOWN";
  const messages: Record<string, string> = {
    PROPERTY_NOT_FOUND: "Immobilie wurde nicht gefunden.",
    UNIT_NOT_FOUND: "Einheit wurde nicht gefunden.",
    TENANT_NOT_FOUND: "Mieter wurde nicht gefunden.",
    BROKER_NOT_FOUND: "Makler wurde nicht gefunden.",
    DOCUMENT_NOT_FOUND: "Mindestens ein Dokument wurde nicht gefunden.",
    UNIT_PROPERTY_MISMATCH: "Einheit gehoert nicht zur gewaehlten Immobilie.",
    TENANT_UNIT_MISMATCH: "Mieter gehoert nicht zur gewaehlten Einheit.",
    TENANT_PROPERTY_MISMATCH: "Mieter gehoert nicht zur gewaehlten Immobilie."
  };
  return messages[code] || "Timeline-Ereignis konnte nicht gespeichert werden.";
}
