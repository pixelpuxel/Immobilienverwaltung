import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { ensureMailTemplates, mailTemplatePreviewContext, renderMailTemplate } from "@/lib/mail-templates";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  id: z.string(),
  subject: z.string().min(1),
  text: z.string().min(1),
  active: z.boolean()
});

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  await ensureMailTemplates(user.portalInstanceId);
  const templates = await prisma.mailTemplate.findMany({
    where: { portalInstanceId: user.portalInstanceId ?? null },
    orderBy: [{ name: "asc" }]
  });
  return NextResponse.json(templates.map(withPreview));
}

export async function PATCH(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const body = updateSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Bitte Eingaben pruefen.", issues: body.error.issues }, { status: 400 });

  const existing = await prisma.mailTemplate.findFirst({
    where: { id: body.data.id, portalInstanceId: user.portalInstanceId ?? null }
  });
  if (!existing) return NextResponse.json({ error: "Template nicht gefunden." }, { status: 404 });

  const updated = await prisma.mailTemplate.update({
    where: { id: existing.id },
    data: {
      subject: body.data.subject,
      text: body.data.text,
      active: body.data.active
    }
  });
  return NextResponse.json(withPreview(updated));
}

function withPreview<T extends { subject: string; text: string; placeholders: string[] }>(template: T) {
  return {
    ...template,
    preview: renderMailTemplate(template, mailTemplatePreviewContext(template))
  };
}
