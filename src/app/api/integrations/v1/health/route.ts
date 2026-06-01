import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    portal: "Immobilienportal",
    version: "1",
    time: new Date().toISOString()
  });
}

