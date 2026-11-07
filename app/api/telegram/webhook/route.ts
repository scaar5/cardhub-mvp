import { NextResponse } from "next/server";
import {
  cardQuestionButtons,
  deriveFeedback,
  FB_CARD,
  FB_REF,
  feedbackButtons,
  refQuestionButtons,
  telegramApi,
  webhookSecret,
  type FbCard,
  type FbRef,
} from "@/lib/telegram";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type Cb = { id: string; data?: string; message?: { chat: { id: number }; message_id: number } };

/**
 * POST /api/telegram/webhook — lo llama Telegram cuando pulsas un botón de una alerta.
 * Alertas nuevas (paso 33): dos preguntas.
 *   "c:<si|otra|lote|reset>:<id>"     → 1) ¿es la carta?  (si "si", aparece la pregunta 2)
 *   "r:<ok|alta|baja|nose>:<id>"      → 2) ¿qué dice 130point?
 *   deals.feedback se deduce de las dos (deriveFeedback).
 * Alertas antiguas: "fb:<bueno|falso>:<id>".
 * Solo acepta avisos con la clave del webhook y que vengan de tu chat (TELEGRAM_CHAT_ID).
 */
export async function POST(req: Request) {
  const secret = await webhookSecret();
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const update = (await req.json().catch(() => null)) as { callback_query?: Cb } | null;
  const cb = update?.callback_query;
  if (!cb?.data) return NextResponse.json({ ok: true });

  const chatId = String(cb.message?.chat.id ?? "");
  if (chatId !== String(process.env.TELEGRAM_CHAT_ID ?? "").trim()) {
    await telegramApi("answerCallbackQuery", { callback_query_id: cb.id, text: "No autorizado" });
    return NextResponse.json({ ok: true });
  }

  const [kind, value, ...rest] = cb.data.split(":");
  const externalId = rest.join(":");
  const answer = (text: string) => telegramApi("answerCallbackQuery", { callback_query_id: cb.id, text });
  const setButtons = (inline_keyboard: unknown) =>
    cb.message
      ? telegramApi("editMessageReplyMarkup", {
          chat_id: cb.message.chat.id,
          message_id: cb.message.message_id,
          reply_markup: { inline_keyboard },
        })
      : null;

  if (kind === "noop") {
    await answer("Pulsa una de las respuestas de debajo");
    return NextResponse.json({ ok: true });
  }

  const db = getSupabaseAdmin();
  if (!db) {
    await answer("No se pudo guardar: sin base de datos");
    return NextResponse.json({ ok: true });
  }

  // --- Alertas antiguas: ✅ / ❌ ---
  if (kind === "fb") {
    if (value !== "bueno" && value !== "falso") return NextResponse.json({ ok: true });
    const { error } = await db
      .from("deals")
      .update({ feedback: value, feedback_at: new Date().toISOString() })
      .eq("external_id", externalId);
    await answer(error ? `No se pudo guardar: ${error.message}` : value === "bueno" ? "✅ Guardado: buen chollo" : "❌ Guardado: falso");
    if (!error) await setButtons(feedbackButtons(externalId, value));
    return NextResponse.json({ ok: true });
  }

  if (kind !== "c" && kind !== "r") return NextResponse.json({ ok: true });

  let { data: deal } = await db
    .from("deals")
    .select("market_value,fb_card,fb_ref")
    .eq("external_id", externalId)
    .maybeSingle<{ market_value: number | null; fb_card?: string | null; fb_ref?: string | null }>();
  if (!deal) {
    // Sin migración 009: al menos la referencia para el texto del botón.
    ({ data: deal } = await db
      .from("deals")
      .select("market_value")
      .eq("external_id", externalId)
      .maybeSingle<{ market_value: number | null }>());
  }
  const refValue = deal?.market_value != null ? Number(deal.market_value) : null;

  // --- Pregunta 1: ¿es la carta? ---
  if (kind === "c") {
    if (value === "reset") {
      await save(db, externalId, { fb_card: null, fb_ref: null, feedback: null, feedback_at: null });
      await answer("Vuelve a responder: ¿es la carta?");
      await setButtons(cardQuestionButtons(externalId));
      return NextResponse.json({ ok: true });
    }
    if (!(value in FB_CARD)) return NextResponse.json({ ok: true });
    const card = value as FbCard;
    const ref = card === "si" ? ((deal?.fb_ref as FbRef | null) ?? null) : null;
    const feedback = deriveFeedback(card, ref);
    const error = await save(db, externalId, {
      fb_card: card,
      fb_ref: ref,
      feedback,
      feedback_at: feedback ? new Date().toISOString() : null,
    });
    if (error) {
      await answer(`No se pudo guardar: ${error}`);
      return NextResponse.json({ ok: true });
    }
    if (card === "si") {
      await answer("Guardado. Ahora: ¿qué dice 130point?");
      await setButtons(refQuestionButtons(externalId, refValue, ref ?? undefined));
    } else {
      await answer(`❌ Guardado: ${FB_CARD[card]}`);
      await setButtons(cardQuestionButtons(externalId, card));
    }
    return NextResponse.json({ ok: true });
  }

  // --- Pregunta 2: ¿qué dice 130point? ---
  if (!(value in FB_REF)) return NextResponse.json({ ok: true });
  const ref = value as FbRef;
  const feedback = deriveFeedback("si", ref);
  const error = await save(db, externalId, {
    fb_card: "si",
    fb_ref: ref,
    feedback,
    feedback_at: feedback ? new Date().toISOString() : null,
  });
  if (error) {
    await answer(`No se pudo guardar: ${error}`);
    return NextResponse.json({ ok: true });
  }
  await answer(
    feedback === "bueno" ? "✅ Guardado: buen chollo" : feedback === "falso" ? "❌ Guardado: referencia inflada" : "Guardado: sin ventas para comparar",
  );
  await setButtons(refQuestionButtons(externalId, refValue, ref));
  return NextResponse.json({ ok: true });
}

/**
 * Guarda las respuestas. Si faltan las columnas fb_card / fb_ref (migración 009 sin ejecutar),
 * guarda al menos deals.feedback para no perder el voto.
 */
async function save(
  db: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  externalId: string,
  row: { fb_card: string | null; fb_ref: string | null; feedback: string | null; feedback_at: string | null },
): Promise<string | null> {
  const { error } = await db.from("deals").update(row).eq("external_id", externalId);
  if (!error) return null;
  if (/fb_card|fb_ref/.test(error.message)) {
    const { error: e2 } = await db
      .from("deals")
      .update({ feedback: row.feedback, feedback_at: row.feedback_at })
      .eq("external_id", externalId);
    return e2 ? e2.message : null;
  }
  return error.message;
}
