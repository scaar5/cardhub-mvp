import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { telegramApi, webhookSecret } from "@/lib/telegram";

export const dynamic = "force-dynamic";

/** GET /api/telegram/setup (x-alert-secret): conecta el bot con /api/telegram/webhook para recibir los votos. */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  const secret = await webhookSecret();
  const url = `${new URL(req.url).origin}/api/telegram/webhook`;
  const set = await telegramApi("setWebhook", { url, secret_token: secret, allowed_updates: ["callback_query"] });
  const info = await telegramApi("getWebhookInfo", {});
  return NextResponse.json({ ok: set.ok, url, set: set.telegram, info: info.telegram });
}
