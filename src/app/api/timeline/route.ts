import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { createTimelineEvent } from "@/lib/timeline-actions";
import { timelineEventCreateSchema } from "@/lib/timeline-schema";
import { listTimelineItems } from "@/lib/timeline";

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const items = await listTimelineItems(user, {
    propertyId: request.nextUrl.searchParams.get("propertyId"),
    unitId: request.nextUrl.searchParams.get("unitId"),
    tenantProfileId: request.nextUrl.searchParams.get("tenantProfileId"),
    includeDerived: request.nextUrl.searchParams.get("derived") !== "0",
    includeInternal: request.nextUrl.searchParams.get("internal") === "1",
    limit: Number(request.nextUrl.searchParams.get("limit") || "80") || 80
  });
  return NextResponse.json({ items, nextCursor: null });
}

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const body = timelineEventCreateSchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "Bitte Eingaben pruefen.", issues: body.error.issues }, { status: 400 });
  try {
    return NextResponse.json(await createTimelineEvent(user, body.data, request), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: timelineActionError(error) }, { status: 400 });
  }
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
