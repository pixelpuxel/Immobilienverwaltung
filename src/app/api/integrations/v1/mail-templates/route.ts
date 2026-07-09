import { AuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { clientIp } from "@/lib/auth";
import { requireAdminIntegration, requireIntegrationUser } from "@/lib/integration-auth";
import { ensureMailTemplates, mailTemplatePreviewContext, renderMailTemplate } from "@/lib/mail-templates";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  id: z.string(),
  subject: z.string().trim().min(1),
  text: z.string().trim().min(1),
  active: z.boolean()
});

export async function GET(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request);
  if (!user) return response;

  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;

  await ensureMailTemplates(user.portalInstanceId);
  const templates = await prisma.mailTemplate.findMany({
    where: { portalInstanceId: user.portalInstanceId ?? null },
    orderBy: [{ name: "asc" }]
  });

  return NextResponse.json({ items: templates.map(withPreview), nextCursor: null });
}

export async function PATCH(request: NextRequest) {
  const { user, response } = await requireIntegrationUser(request, ["write:settings"]);
  if (!user) return response;

  const forbidden = requireAdminIntegration(user);
  if (forbidden) return forbidden;

  const body = updateSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Bitte die Eingaben prüfen.", issues: body.error.issues } }, { status: 400 });
  }

  const existing = await prisma.mailTemplate.findFirst({
    where: { id: body.data.id, portalInstanceId: user.portalInstanceId ?? null }
  });
  if (!existing) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Mail-Template nicht gefunden." } }, { status: 404 });

  const updated = await prisma.mailTemplate.update({
    where: { id: existing.id },
    data: {
      subject: body.data.subject,
      text: body.data.text,
      active: body.data.active
    }
  });

  await auditLog({
    userId: user.id,
    action: AuditAction.PERMISSION_CHANGED,
    entity: "MailTemplate",
    entityId: updated.id,
    ipAddress: clientIp(request),
    detail: { mailTemplateUpdated: true, key: updated.key, active: updated.active }
  });

  return NextResponse.json(withPreview(updated));
}

function withPreview<T extends { subject: string; text: string; placeholders: string[] }>(template: T) {
  return {
    ...template,
    preview: renderMailTemplate(template, mailTemplatePreviewContext(template))
  };
}
