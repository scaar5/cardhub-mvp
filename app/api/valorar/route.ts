import { NextResponse } from "next/server";
import { point130Query } from "@/lib/point130";
import { authorized } from "@/lib/auth";
import { ALERT_THRESHOLD, SAVE_THRESHOLD } from "@/lib/config";
import { judgeDeal } from "@/lib/deals";
import { ebayConfigured } from "@/lib/ebay";
import { excludedReason } from "@/lib/filters";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { dealMessage, sendTelegram } from "@/lib/telegram";
import { valuate } from "@/lib/valuation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/valorar   (cabecera x-alert-secret: <ALERT_SECRET>)
 * Body: { title, platform: "vinted"|"wallapop", price, url?, query?, save? }
 * Valora el anuncio con el mismo sistema que las alertas (lib/valuation.ts) y,
 * si save=true, lo guarda (y avisa por Telegram si es chollo).
 */
export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Clave incorrecta" }, { status: 401 });
  }
  if (!ebayConfigured()) {
    return NextResponse.json({ ok: false, error: "eBay no configurado" }, { status: 503 });
  }
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "Falta SUPABASE_SECRET_KEY" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    platform?: string;
    price?: number | string;
    url?: string;
    query?: string;
    save?: boolean;
  };
  const title = body.title?.trim();
  const price = Number(String(body.price ?? "").replace(",", "."));
  const platform = body.platform === "wallapop" ? "wallapop" : "vinted";
  if (!title || !(price > 0)) {
    return NextResponse.json({ ok: false, error: "Faltan título o precio" }, { status: 400 });
  }

  let v;
  try {
    v = await valuate(db, title, body.query?.trim() || undefined);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }

  const base = {
    ok: true,
    card: v.label,
    point130: v.recognition ? point130Query(v.recognition.card, v.recognition.parallel) : null,
    confidence: v.recognition?.confidence ?? null,
    approximate: v.approximate,
    searched: v.searched,
    comparables: v.comparables.slice(0, 30),
    excluded: excludedReason(title),
  };

  if (!v.ref) {
    return NextResponse.json({ ...base, market_value: null, reason: v.reason, saved: false, alerted: false });
  }

  const ref = v.ref;
  const pct = Math.round((1 - price / ref.value) * 100);
  // Mismas reglas que el sniper (judgeDeal) para decir si es chollo
  const verdict = judgeDeal(price, { ...ref, level: ref.level ?? 3, cardId: ref.cardId ?? "" });
  const isDeal = "pct" in verdict && !v.approximate;
  const label = isDeal
    ? pct >= ALERT_THRESHOLD
      ? "chollo"
      : "buen-precio"
    : "reject" in verdict && /anuncios de eBay/.test(verdict.reject)
      ? "sospechoso"
      : pct >= SAVE_THRESHOLD
        ? "buen-precio"
        : pct >= 0
          ? "normal"
          : "caro";

  let saved = false;
  let alerted = false;
  if (body.save) {
    const url = body.url?.trim() || null;
    const row = {
      external_id: url ? `${platform}:${url}` : null,
      title,
      platform,
      price,
      market_value: ref.value,
      url,
      query: v.searched[0] ?? null,
      card_id: v.recognition?.card.id ?? null,
      parallel: v.recognition?.parallel ?? null,
      ref_source: ref.source,
      ref_sample: ref.sample,
      ref_level: ref.level,
    };
    const { error } = await db.from("deals").upsert(row, { onConflict: "external_id" });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    saved = true;
    if (isDeal && pct >= ALERT_THRESHOLD) {
      await sendTelegram(
        dealMessage({
          ...row,
          card: v.label ?? undefined,
          sample: ref.sample,
          source: ref.source,
          note: ref.basedOn
            ? `Precio estimado basado en ${ref.basedOn}, al no haber ventas exactas de ${v.label}`
            : undefined,
        }),
      );
      alerted = true;
    }
  }

  return NextResponse.json({
    ...base,
    market_value: ref.value,
    sample: ref.sample,
    source: ref.source,
    level: ref.level,
    based_on: ref.basedOn ?? null,
    pct,
    verdict: label,
    verdict_note: "reject" in verdict ? verdict.reject : null,
    saved,
    alerted,
  });
}
