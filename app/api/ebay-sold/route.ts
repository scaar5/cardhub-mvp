import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { MIN_PRICE } from "@/lib/config";
import { recognize } from "@/lib/recognize";
import { EBAY_SEARCHES } from "@/lib/set-rules";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Ventas REALES de eBay.es como referencia de precio.
 *
 * GET  /api/ebay-sold (x-alert-secret) → búsquedas que hay que hacer en eBay.es (vendidos).
 * POST /api/ebay-sold (x-alert-secret) → { items: [{ id, title, price, soldAt, url, set }] }
 *   reconoce cada venta y la guarda en `listings` con platform = "ebay_sold" y seen_at = fecha de venta.
 *
 * La lectura de eBay la hace el workflow de GitHub (scripts/ebay-sold-scan.mjs).
 * Las ventas por "Mejor oferta aceptada" (importe oculto) ya vienen descartadas.
 */
export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, searches: EBAY_SEARCHES });
}

interface InItem {
  id: string;
  title: string;
  price: number;
  soldAt: string;
  url: string;
  set?: string;
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }
  const db = getSupabaseAdmin();
  if (!db) {
    return NextResponse.json({ ok: false, error: "Falta SUPABASE_SECRET_KEY" }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as { items?: InItem[] } | null;
  const items = (body?.items ?? []).filter(
    (i) => i && i.id && i.title && Number.isFinite(i.price) && i.price >= MIN_PRICE && !isNaN(Date.parse(i.soldAt)),
  );

  const rows = new Map<string, Record<string, unknown>>();
  for (const it of items) {
    const { match } = recognize(it.title, it.set);
    if (!match || match.confidence !== "alta") continue;
    rows.set(it.id, {
      external_id: `ebay_sold:${it.id}`,
      card_id: match.card.id,
      parallel: match.parallel,
      platform: "ebay_sold",
      title: it.title,
      price: it.price,
      url: it.url,
      seen_at: it.soldAt,
    });
  }

  if (rows.size) {
    const { error } = await db.from("listings").upsert([...rows.values()], { onConflict: "external_id" });
    if (error) return NextResponse.json({ ok: false, error: `listings: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true, received: items.length, recognized: rows.size, saved: rows.size });
}
