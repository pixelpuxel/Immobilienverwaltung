import { AuditAction, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { assertSameOrigin, clientIp, requireApiUser } from "@/lib/auth";
import { isRealEmail, sendMail } from "@/lib/mail";
import { renderMailTemplate } from "@/lib/mail-templates";
import { portalWhere } from "@/lib/portal-instance";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  templateId: z.string(),
  tenantUserIds: z.array(z.string()).min(1)
});

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Bitte Vorlage und Empfaenger auswaehlen.", issues: body.error.issues }, { status: 400 });

  const template = await prisma.mailTemplate.findFirst({
    where: { id: body.data.templateId, portalInstanceId: user.portalInstanceId ?? null }
  });
  if (!template) return NextResponse.json({ error: "Mailvorlage wurde nicht gefunden." }, { status: 404 });
  if (!template.active) return NextResponse.json({ error: "Mailvorlage ist pausiert." }, { status: 400 });

  const recipients = await prisma.user.findMany({
    where: { id: { in: body.data.tenantUserIds }, role: Role.TENANT, active: true, ...portalWhere(user) },
    include: { tenantProfile: { include: { unit: { include: { property: true } } } } },
    orderBy: [{ name: "asc" }, { email: "asc" }]
  });
  const results = [];
  for (const recipient of recipients) {
    const label = recipient.name || recipient.email || recipient.username || recipient.id;
    if (!isRealEmail(recipient.email)) {
      results.push({ userId: recipient.id, label, sent: false, reason: "Keine echte E-Mail-Adresse" });
      continue;
    }
    const rendered = renderMailTemplate(template, {
      name: recipient.name || [recipient.tenantProfile?.firstName, recipient.tenantProfile?.lastName].filter(Boolean).join(" "),
      login: recipient.username || recipient.email,
      property: recipient.tenantProfile?.unit?.property.name || "-",
      unit: recipient.tenantProfile?.unit?.unitNumber || "-"
    });
    try {
      const sent = await sendMail({ to: recipient.email, subject: rendered.subject, text: rendered.text });
      results.push({ userId: recipient.id, label, sent: Boolean(sent.sent), reason: sent.sent ? null : sent.reason || "Versand fehlgeschlagen" });
    } catch (error) {
      results.push({ userId: recipient.id, label, sent: false, reason: error instanceof Error ? error.message : "Versand fehlgeschlagen" });
    }
  }

  await auditLog({
    userId: user.id,
    action: AuditAction.PERMISSION_CHANGED,
    entity: "MailTemplate",
    entityId: template.id,
    ipAddress: clientIp(request),
    detail: { broadcast: true, template: template.name, recipients: results.length, sent: results.filter((item) => item.sent).length }
  });
  return NextResponse.json({ results });
}
