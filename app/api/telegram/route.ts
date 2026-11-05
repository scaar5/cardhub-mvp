import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { sendTelegram, telegramConfigured } from "@/lib/telegram";

/**
 * POST /api/telegram
 * Header: x-alert-secret: <ALERT_SECRET>
 * Body: { "text": "🔥 Chollo: ..." }
 */
export async function POST(req: Request) {
  if (!telegramConfigured()) {
    return NextResponse.json({ ok: false, error: "Telegram no configurado" }, { status: 503 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { text?: string };
  if (!body.text) {
    return NextResponse.json({ ok: false, error: "Falta 'text'" }, { status: 400 });
  }
  const r = await sendTelegram(body.text);
  return NextResponse.json(r, { status: r.ok ? 200 : 502 });
}
