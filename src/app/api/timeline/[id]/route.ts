import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { deleteTimelineEvent, updateTimelineEvent } from "@/lib/timeline-actions";
import { timelineEventUpdateSchema } from "@/lib/timeline-schema";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const body = timelineEventUpdateSchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "Bitte Eingaben pruefen.", issues: body.error.issues }, { status: 400 });
  try {
    const item = await updateTimelineEvent(user, params.id, body.data, request);
    return item ? NextResponse.json(item) : NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: timelineActionError(error) }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const ok = await deleteTimelineEvent(user, params.id, request);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
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
