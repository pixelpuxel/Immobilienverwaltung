import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { isMailConfigured, isRealEmail, sendMail } from "@/lib/mail";

const schema = z.object({
  to: z.string().email().optional()
});

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  if (!isMailConfigured()) return NextResponse.json({ error: "Mailversand ist nicht konfiguriert. SMTP_HOST und SMTP_FROM fehlen." }, { status: 400 });

  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Bitte eine gültige E-Mail-Adresse angeben." }, { status: 400 });
  const to = body.data.to || user.contactEmail || user.email;
  if (!isRealEmail(to)) return NextResponse.json({ error: "Für Testmail bitte eine echte E-Mail-Adresse verwenden." }, { status: 400 });

  const result = await sendMail({
    to,
    subject: "Testmail aus dem Immobilienportal",
    text: [
      "Diese Testmail wurde vom Immobilienportal versendet.",
      "",
      `Portal: ${env.appUrl}`,
      `SMTP: ${env.smtpHost}:${env.smtpPort}`,
      "",
      "Wenn diese Mail angekommen ist, funktioniert der SMTP-Versand grundsätzlich."
    ].join("\n")
  }).catch((error) => ({ sent: false, reason: error instanceof Error ? error.message : "unknown" }));

  if (!result.sent) return NextResponse.json({ error: `Testmail konnte nicht versendet werden: ${result.reason || "unbekannter Fehler"}` }, { status: 500 });
  return NextResponse.json({ ok: true, to });
}
