import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import {
  getBankingIntegration,
  redactBankingIntegration,
  saveBankingIntegration
} from "@/lib/banking-integration";

const schema = z.object({
  baseUrl: z.string().url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "banking.schreiber.info" && (url.pathname === "/" || url.pathname === "");
  }, "Nur https://banking.schreiber.info ist erlaubt."),
  apiToken: z.string().trim().optional()
});

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  return NextResponse.json(redactBankingIntegration(await getBankingIntegration(user.portalInstanceId)));
}

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) {
    return NextResponse.json({ error: "CSRF-Schutz: ungueltiger Ursprung." }, { status: 403 });
  }
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Bitte URL und Token pruefen." }, { status: 400 });
  const saved = await saveBankingIntegration({
    portalInstanceId: user.portalInstanceId,
    baseUrl: parsed.data.baseUrl,
    apiToken: parsed.data.apiToken
  });
  return NextResponse.json(redactBankingIntegration(saved));
}
