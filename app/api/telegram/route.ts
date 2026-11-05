import { NextResponse } from "next/server";

/**
 * POST /api/telegram
 * Header:  x-alert-secret: <ALERT_SECRET>
 * Body:    { "text": "🔥 Chollo: ..." }
 * Envía un mensaje a tu chat de Telegram. Lo usará el sniper cuando detecte un chollo.
 */
export async function POST(req: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const secret = process.env.ALERT_SECRET;

  if (!token || !chatId) {
    return NextResponse.json({ ok: false, error: "Telegram no configurado" }, { status: 503 });
  }
  if (!secret || req.headers.get("x-alert-secret") !== secret) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { text?: string };
  if (!body.text) {
    return NextResponse.json({ ok: false, error: "Falta 'text'" }, { status: 400 });
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: body.text, disable_web_page_preview: false }),
  });

  const data = await res.json();
  return NextResponse.json({ ok: res.ok, telegram: data }, { status: res.ok ? 200 : 502 });
}
