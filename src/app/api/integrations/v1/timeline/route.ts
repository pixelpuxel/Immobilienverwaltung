import { NextRequest, NextResponse } from "next/server";
import { integrationError, requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { createTimelineEvent } from "@/lib/timeline-actions";
import { timelineEventCreateSchema } from "@/lib/timeline-schema";
import { listTimelineItems } from "@/lib/timeline";

export async function GET(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request);
  if (!user) return response;
  if (!hasAnyScope(user.tokenScopes, ["read:timeline", "read:properties"])) return integrationError("FORBIDDEN", "Token braucht Scope: read:timeline oder read:properties", 403);
  const items = await listTimelineItems(user, {
    propertyId: request.nextUrl.searchParams.get("propertyId"),
    unitId: request.nextUrl.searchParams.get("unitId"),
    tenantProfileId: request.nextUrl.searchParams.get("tenantProfileId"),
    includeDerived: request.nextUrl.searchParams.get("derived") !== "0",
    includeInternal: request.nextUrl.searchParams.get("internal") === "1",
    limit: Number(request.nextUrl.searchParams.get("limit") || "100") || 100
  });
  return NextResponse.json({ items, nextCursor: null });
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request);
  if (!user) return response;
  if (!hasAnyScope(user.tokenScopes, ["write:timeline", "write:properties"])) return integrationError("FORBIDDEN", "Token braucht Scope: write:timeline oder write:properties", 403);
  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;
  const body = timelineEventCreateSchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return integrationError("BAD_REQUEST", "Bitte Timeline-Eingaben pruefen.", 400);
  try {
    return NextResponse.json(await createTimelineEvent(user, body.data, request), { status: 201 });
  } catch (error) {
    return integrationError("BAD_REQUEST", timelineActionError(error), 400);
  }
}

function hasAnyScope(tokenScopes: string[], scopes: string[]) {
  return scopes.some((scope) => tokenScopes.includes(scope));
}

function timelineActionError(error: unknown) {
  const code = error instanceof Error ? error.message : "UNKNOWN";
  const messages: Record<string, string> = {
    FORBIDDEN: "Nicht erlaubt.",
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
