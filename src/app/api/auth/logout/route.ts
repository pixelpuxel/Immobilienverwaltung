import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, clearSessionCookie } from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
