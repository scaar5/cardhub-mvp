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
  // ?probe=1 → comprueba si eBay.es deja leer la página de vendidos desde Vercel
  if (new URL(req.url).searchParams.get("probe")) {
    const res = await fetch(
      "https://www.ebay.es/sch/i.html?_nkw=topps+chrome+ucc&LH_Sold=1&LH_Complete=1&_ipg=60",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "es-ES,es;q=0.9",
        },
      },
    );
    const html = await res.text();
    return NextResponse.json({
      ok: true,
      status: res.status,
      length: html.length,
      page: html.match(/<title>([^<]*)/)?.[1] ?? "",
      items: (html.match(/\/itm\/\d{10,}/g) ?? []).length,
      sold: (html.match(/Vendido/g) ?? []).length,
    });
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
