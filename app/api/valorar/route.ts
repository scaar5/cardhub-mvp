import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { ALERT_THRESHOLD } from "@/lib/config";
import { ebayConfigured } from "@/lib/ebay";
import { estimateMarketValue } from "@/lib/market";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { dealMessage, sendTelegram } from "@/lib/telegram";

export const dynamic = "force-dynamic";

/**
 * POST /api/valorar   (cabecera x-alert-secret: <ALERT_SECRET>)
 * Body: { title, platform: "vinted"|"wallapop", price, url?, query?, save? }
 * Calcula el valor de mercado con eBay.es y, si save=true, lo guarda (y avisa si es chollo).
 */
export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Clave incorrecta" }, { status: 401 });
  }
  if (!ebayConfigured()) {
    return NextResponse.json({ ok: false, error: "eBay no configurado" }, { status: 503 });
  }

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

  const query = body.query?.trim() || title;
  const market = await estimateMarketValue(query);
  if (!market.value) {
    return NextResponse.json({ ok: false, error: "No hay anuncios comparables en eBay para esa búsqueda" });
  }
  const pct = Math.round((1 - price / market.value) * 100);

  let saved = false;
  let alerted = false;
  if (body.save) {
    const db = getSupabaseAdmin();
    if (!db) {
      return NextResponse.json({ ok: false, error: "Falta SUPABASE_SECRET_KEY" }, { status: 503 });
    }
    const url = body.url?.trim() || null;
    const row = {
      external_id: url ? `${platform}:${url}` : null,
      title,
      platform,
      price,
      market_value: market.value,
      url,
      query,
    };
    const { error } = await db.from("deals").upsert(row, { onConflict: "external_id" });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    saved = true;
    if (pct >= ALERT_THRESHOLD) {
      await sendTelegram(dealMessage(row));
      alerted = true;
    }
  }

  return NextResponse.json({
    ok: true,
    query,
    market_value: market.value,
    sample: market.sample,
    reliable: market.reliable,
    pct,
    saved,
    alerted,
  });
}
