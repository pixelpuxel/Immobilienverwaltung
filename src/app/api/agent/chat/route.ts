import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { processAgentMessage, resetAgentConversation, type AgentStreamEvent } from "@/lib/agent";
import { prisma } from "@/lib/prisma";

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
  const wantsStream = request.headers.get("accept")?.includes("text/event-stream") || request.nextUrl.searchParams.get("stream") === "1";
  if (wantsStream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: AgentStreamEvent) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };
        try {
          const result = await processAgentMessage({
            user,
            message: parsed.data.message,
            conversationId: parsed.data.conversationId,
            channel: "web"
          }, { onEvent: send });
          send({ type: "final", answer: result.answer, conversationId: result.conversationId, artifacts: result.artifacts });
          controller.close();
        } catch (error) {
          send({ type: "error", message: error instanceof Error ? error.message : "Agent-Anfrage fehlgeschlagen." });
          controller.close();
        }
      }
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive"
      }
    });
  }
  const result = await processAgentMessage({
    user,
    message: parsed.data.message,
    conversationId: parsed.data.conversationId,
    channel: "web"
  });
  return NextResponse.json({
    ...result,
    tools: result.tools.map(({ attachments: _attachments, ...tool }) => tool),
    attachments: []
  });
}

export async function DELETE(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz: ungueltiger Ursprung." }, { status: 403 });
  const user = await requireApiUser(request);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const conversationId = request.nextUrl.searchParams.get("conversationId");
  await resetAgentConversation(user, conversationId);
  return NextResponse.json({ ok: true });
}

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const requestedId = request.nextUrl.searchParams.get("conversationId");
  const includeDebug = request.nextUrl.searchParams.get("includeDebug") === "1";
  const conversation = requestedId
    ? await prisma.agentConversation.findFirst({
      where: { id: requestedId, portalInstanceId: user.portalInstanceId, OR: [{ userId: user.id }, { userId: null }, { channel: "telegram" }] },
      include: { messages: { orderBy: { createdAt: "asc" }, take: 80 } }
    })
    : await prisma.agentConversation.findFirst({
      where: { portalInstanceId: user.portalInstanceId, userId: user.id, channel: "web" },
      orderBy: { updatedAt: "desc" },
      include: { messages: { orderBy: { createdAt: "asc" }, take: 80 } }
    });
  if (!conversation) return NextResponse.json({ conversationId: null, messages: [] });
  const [state, runLogs] = includeDebug
    ? await Promise.all([
      prisma.agentConversationState.findUnique({ where: { conversationId: conversation.id } }).catch(() => null),
      prisma.agentRunLog.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: "desc" }, take: 20 }).catch(() => [])
    ])
    : [null, []];
  return NextResponse.json({
    conversationId: conversation.id,
    title: conversation.title,
    messages: conversation.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt
    })),
    ...(includeDebug ? { state, runLogs } : {})
  });
}
