import { NextRequest, NextResponse } from "next/server";
import { processAgentMessage } from "@/lib/agent";
import { getAiConfig, transcribeAudio } from "@/lib/ai-search";
import { requireIntegrationUser } from "@/lib/integration-auth";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request);
  if (!user) return response;

  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof File)) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Bitte eine Audiodatei hochladen." } }, { status: 400 });
  }
  if (audio.size <= 0) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Die Audiodatei ist leer." } }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Die Audiodatei ist zu gross. Maximal 25 MB sind erlaubt." } }, { status: 413 });
  }

  const conversationId = stringField(form?.get("conversationId"));
  const bytes = Buffer.from(await audio.arrayBuffer());
  const transcript = await transcribeAudio(
    await getAiConfig(user.portalInstanceId),
    bytes,
    audio.name || "portal-agent-voice.m4a",
    audio.type || "audio/mp4"
  );
  if (!transcript) {
    return NextResponse.json({ error: { code: "TRANSCRIPTION_EMPTY", message: "Ich konnte die Sprachnachricht nicht transkribieren." } }, { status: 422 });
  }

  const result = await processAgentMessage({
    user,
    message: transcript,
    conversationId,
    channel: "web"
  });

  return NextResponse.json({
    transcript,
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

function stringField(value: FormDataEntryValue | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
