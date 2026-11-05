import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "scards",
    supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    ebay: Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET),
    writer: Boolean(process.env.SUPABASE_SECRET_KEY),
    time: new Date().toISOString(),
  });
}
