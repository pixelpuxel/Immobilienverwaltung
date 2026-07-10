import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { processAgentMessage, resetAgentConversation } from "@/lib/agent";
import { requireIntegrationUser } from "@/lib/integration-auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  message: z.string().trim().min(1),
  conversationId: z.string().optional().nullable()
});

export async function GET(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request);
  if (!user) return response;

  const requestedId = request.nextUrl.searchParams.get("conversationId");
  const conversation = requestedId
    ? await prisma.agentConversation.findFirst({
      where: { id: requestedId, portalInstanceId: user.portalInstanceId, userId: user.id },
      include: { messages: { orderBy: { createdAt: "asc" }, take: 80 } }
    })
    : await prisma.agentConversation.findFirst({
      where: { portalInstanceId: user.portalInstanceId, userId: user.id, channel: "web" },
      orderBy: { updatedAt: "desc" },
      include: { messages: { orderBy: { createdAt: "asc" }, take: 80 } }
    });

  if (!conversation) return NextResponse.json({ conversationId: null, messages: [] });
  return NextResponse.json({
    conversationId: conversation.id,
    title: conversation.title,
    messages: conversation.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt
    }))
  });
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request);
  if (!user) return response;

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Bitte Nachricht eingeben." } }, { status: 400 });
  }

  const result = await processAgentMessage({
    user,
    message: parsed.data.message,
    conversationId: parsed.data.conversationId,
    channel: "web"
  });

  return NextResponse.json({
    conversationId: result.conversationId,
    answer: result.answer,
    steps: result.steps,
    tools: result.tools.map((tool) => ({
      name: tool.name,
      ok: tool.ok,
      summary: tool.summary,
      needsClarification: tool.needsClarification
    })),
    artifacts: result.artifacts.map((artifact) => ({
      type: artifact.type,
      title: artifact.label,
      url: artifact.url
    }))
  });
}

export async function DELETE(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request);
  if (!user) return response;

  await resetAgentConversation(user, request.nextUrl.searchParams.get("conversationId"));
  return NextResponse.json({ ok: true });
}
