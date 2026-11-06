import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { CARDS, normalize, type CatalogCard } from "@/lib/catalog";
import { MIN_PRICE } from "@/lib/config";
import { ebayConfigured, searchEbay } from "@/lib/ebay";
import { recognize } from "@/lib/recognize";
import { loadReferences, resolveReference } from "@/lib/reference";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Búsquedas por pasada: cabe en el tiempo y deja margen en el límite diario de eBay (5.000 llamadas). */
const MAX_QUERIES = 35;
/** Anuncios de Vinted de los últimos días cuyas cartas buscamos en eBay. */
const VINTED_DAYS = 7;

const cardById = new Map(CARDS.map((c) => [c.id, c]));

/** Producto en palabras que salen en casi todos los títulos ("topps chrome", "prizm world cup"…). */
function product(card: CatalogCard): string | null {
  const s = card.set_slug;
  if (s.startsWith("topps-chrome-")) return "topps chrome";
  if (s.startsWith("topps-merlin-")) return "topps merlin";
  if (s.startsWith("topps-finest-")) return "topps finest";
  if (s.startsWith("panini-prizm-world-cup-")) return "prizm world cup";
  return null;
}

/**
 * GET /api/ebay-targeted   (cabecera x-alert-secret: <ALERT_SECRET>)
 * Referencias a medida: para las cartas que han salido en Vinted y aún no tienen precio
 * de referencia EXACTO, busca en eBay.es "jugador + producto" (p. ej. "lamine yamal topps chrome").
 * Una búsqueda trae todas las cartas de ese jugador en ese producto (todas las temporadas y
 * paralelas); el reconocedor decide cuál es cada anuncio y solo se guardan los de confianza alta.
 */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  if (!ebayConfigured()) return NextResponse.json({ ok: true, skipped: "eBay no configurado todavía" });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "Falta SUPABASE_SECRET_KEY" }, { status: 503 });

  const started = Date.now();
  const since = new Date(Date.now() - VINTED_DAYS * 86400_000).toISOString();
  const { data, error } = await db
    .from("listings")
    .select("card_id,parallel")
    .eq("platform", "vinted")
    .gte("seen_at", since)
    .limit(10000);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Cartas (y variante) vistas en Vinted, sin referencia exacta
  const wanted = new Map<string, { card: CatalogCard; parallel: string | null }>();
  for (const r of data ?? []) {
    const card = cardById.get(r.card_id);
    if (card) wanted.set(`${r.card_id}|${r.parallel ?? ""}`, { card, parallel: r.parallel ?? null });
  }
  const refs = await loadReferences(db, [...new Set([...wanted.values()].map((w) => w.card.id))]);
  const missing = [...wanted.values()].filter(({ card, parallel }) => resolveReference(refs, card, parallel)?.level !== 1);

  // Una búsqueda por jugador + producto; primero los que más anuncios tienen sin referencia
  const queries = new Map<string, number>();
  for (const { card } of missing) {
    const p = product(card);
    if (!p) continue;
    const q = `${normalize(card.player)} ${p}`;
    queries.set(q, (queries.get(q) ?? 0) + 1);
  }
  const all = [...queries.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([q]) => q);
  // Rotación: cada pasada (cada media hora) sigue por donde se quedó la anterior
  const offset = all.length ? (Math.floor(Date.now() / 1_800_000) * MAX_QUERIES) % all.length : 0;
  const batch = [...all.slice(offset), ...all.slice(0, offset)].slice(0, MAX_QUERIES);

  let saved = 0;
  const report: Record<string, unknown>[] = [];
  for (const q of batch) {
    if (Date.now() - started > 50_000) break;
    try {
      const items = await searchEbay(q, { limit: 200 });
      const now = new Date().toISOString();
      const rows = [];
      for (const it of items) {
        if (it.price < MIN_PRICE) continue;
        const { match } = recognize(it.title);
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
        const { error: e } = await db.from("listings").upsert(rows, { onConflict: "external_id" });
        if (e) throw new Error(e.message);
      }
      saved += rows.length;
      report.push({ q, seen: items.length, recognized: rows.length });
    } catch (e) {
      report.push({ q, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({
    ok: true,
    vinted_cards: wanted.size,
    without_exact_ref: missing.length,
    queries_total: all.length,
    queries_done: report.length,
    references_saved: saved,
    report,
  });
}
