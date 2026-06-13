import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { processAgentMessage } from "@/lib/agent";

const schema = z.object({
  message: z.string().trim().min(1),
  conversationId: z.string().optional().nullable()
});

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz: ungueltiger Ursprung." }, { status: 403 });
  const user = await requireApiUser(request);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Bitte Nachricht eingeben." }, { status: 400 });
  const result = await processAgentMessage({
    user,
    message: parsed.data.message,
    conversationId: parsed.data.conversationId,
    channel: "web"
  });
  return NextResponse.json(result);
}
