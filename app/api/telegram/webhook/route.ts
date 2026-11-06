import { NextResponse } from "next/server";
import { feedbackButtons, telegramApi, webhookSecret } from "@/lib/telegram";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/telegram/webhook — lo llama Telegram cuando pulsas un botón de una alerta.
 * Guarda tu voto en deals.feedback ("bueno" / "falso") y marca el botón elegido.
 * Solo acepta avisos con la clave del webhook y que vengan de tu chat (TELEGRAM_CHAT_ID).
 */
export async function POST(req: Request) {
  const secret = await webhookSecret();
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const update = (await req.json().catch(() => null)) as {
    callback_query?: { id: string; data?: string; from?: { id: number }; message?: { chat: { id: number }; message_id: number } };
  } | null;
  const cb = update?.callback_query;
  if (!cb?.data?.startsWith("fb:")) return NextResponse.json({ ok: true });

  const chatId = String(cb.message?.chat.id ?? "");
  if (chatId !== String(process.env.TELEGRAM_CHAT_ID ?? "").trim()) {
    await telegramApi("answerCallbackQuery", { callback_query_id: cb.id, text: "No autorizado" });
    return NextResponse.json({ ok: true });
  }

  const [, vote, ...rest] = cb.data.split(":");
  const externalId = rest.join(":");
  if (vote !== "bueno" && vote !== "falso") return NextResponse.json({ ok: true });

  const db = getSupabaseAdmin();
  const { error } = db
    ? await db.from("deals").update({ feedback: vote, feedback_at: new Date().toISOString() }).eq("external_id", externalId)
    : { error: { message: "sin base de datos" } };

  await telegramApi("answerCallbackQuery", {
    callback_query_id: cb.id,
    text: error ? `No se pudo guardar: ${error.message}` : vote === "bueno" ? "✅ Guardado: buen chollo" : "❌ Guardado: falso",
  });
  if (!error && cb.message) {
    await telegramApi("editMessageReplyMarkup", {
      chat_id: cb.message.chat.id,
      message_id: cb.message.message_id,
      reply_markup: { inline_keyboard: feedbackButtons(externalId, vote) },
    });
  }
  return NextResponse.json({ ok: true });
}
