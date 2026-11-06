import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { MIN_PRICE } from "@/lib/config";
import { ebayConfigured, searchEbay } from "@/lib/ebay";
import { recognize } from "@/lib/recognize";
import { EBAY_SEARCHES } from "@/lib/set-rules";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/sniper   (cabecera x-alert-secret: <ALERT_SECRET>)
 * eBay como REFERENCIA de precios (ya no busca chollos en eBay):
 *   1. busca cada colección del catálogo en eBay.es (lib/set-rules.ts),
 *   2. reconoce la carta y variante de cada anuncio (lib/recognize.ts),
 *   3. guarda los reconocidos con confianza alta en `listings`.
 * Con eso, /api/vinted calcula el precio de referencia de cada carta.
 */
export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }
  if (!ebayConfigured()) {
    return NextResponse.json({ ok: true, skipped: "eBay no configurado todavía" });
  }
  const db = getSupabaseAdmin();
  if (!db) {
    return NextResponse.json(
      { ok: false, error: "Falta SUPABASE_SECRET_KEY para escribir en la base de datos" },
      { status: 503 },
    );
  }

  const started = Date.now();
  const report: Record<string, unknown>[] = [];
  let total = 0;

  for (const { q, set } of EBAY_SEARCHES) {
    if (Date.now() - started > 50_000) {
      report.push({ q, skipped: "sin tiempo en esta pasada" });
      continue;
    }
    try {
      const items = await searchEbay(q, { limit: 200 });
      const now = new Date().toISOString();
      const rows = [];
      for (const it of items) {
        if (it.price < MIN_PRICE) continue;
        const { match } = recognize(it.title, set);
        if (!match || match.confidence !== "alta") continue;
        rows.push({
          external_id: `ebay:${it.id}`,
          card_id: match.card.id,
          parallel: match.parallel,
          platform: "ebay",
          title: it.title,
          price: it.price,
          url: it.url,
          seen_at: now,
        });
      }
      if (rows.length) {
        const { error } = await db.from("listings").upsert(rows, { onConflict: "external_id" });
        if (error) throw new Error(error.message);
      }
      total += rows.length;
      report.push({ q, seen: items.length, recognized: rows.length });
    } catch (e) {
      report.push({ q, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({ ok: true, references_saved: total, report });
}
