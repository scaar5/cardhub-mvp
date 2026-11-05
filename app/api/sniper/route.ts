import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { ALERT_THRESHOLD, MIN_PRICE, MIN_SAMPLE, SAVE_THRESHOLD, SEARCHES } from "@/lib/config";
import { ebayConfigured, searchEbay } from "@/lib/ebay";
import { marketValueFrom } from "@/lib/market";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { dealMessage, sendTelegram } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/sniper   (cabecera x-alert-secret: <ALERT_SECRET>)
 * Para cada búsqueda de lib/config.ts:
 *   1. calcula el valor de mercado con los anuncios de eBay.es,
 *   2. mira los anuncios más nuevos,
 *   3. guarda los que tienen ≥ SAVE_THRESHOLD % de descuento,
 *   4. avisa por Telegram de los nuevos con ≥ ALERT_THRESHOLD %.
 */
export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }
  if (!ebayConfigured()) {
    return NextResponse.json({ ok: false, error: "eBay no configurado" }, { status: 503 });
  }
  const db = getSupabaseAdmin();
  if (!db) {
    return NextResponse.json(
      { ok: false, error: "Falta SUPABASE_SECRET_KEY para escribir en la base de datos" },
      { status: 503 },
    );
  }

  const report: Record<string, unknown>[] = [];
  let alerts = 0;

  for (const q of SEARCHES) {
    try {
      const [pool, newest] = await Promise.all([
        searchEbay(q, { limit: 100 }),
        searchEbay(q, { sort: "newlyListed", limit: 50 }),
      ]);
      const market = marketValueFrom([...pool, ...newest]);
      if (market.sample < MIN_SAMPLE || !market.value) {
        report.push({ q, skipped: "pocos comparables", sample: market.sample });
        continue;
      }

      const rows = newest
        .filter((it) => it.price >= MIN_PRICE)
        .map((it) => ({
          external_id: `ebay:${it.id}`,
          title: it.title,
          platform: "ebay",
          price: it.price,
          market_value: market.value,
          url: it.url,
          query: q,
          pct: Math.round((1 - it.price / market.value) * 100),
        }))
        .filter((r) => r.pct >= SAVE_THRESHOLD);

      let inserted: typeof rows = [];
      if (rows.length) {
        const { data, error } = await db
          .from("deals")
          .upsert(
            rows.map(({ pct: _pct, ...r }) => r),
            { onConflict: "external_id", ignoreDuplicates: true },
          )
          .select("external_id");
        if (error) throw new Error(error.message);
        const ids = new Set((data ?? []).map((d) => d.external_id));
        inserted = rows.filter((r) => ids.has(r.external_id));
      }

      for (const r of inserted.filter((r) => r.pct >= ALERT_THRESHOLD)) {
        await sendTelegram(dealMessage(r));
        alerts++;
      }

      report.push({
        q,
        market_value: market.value,
        sample: market.sample,
        checked: newest.length,
        saved: inserted.length,
      });
    } catch (e) {
      report.push({ q, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({ ok: true, alerts, report });
}
