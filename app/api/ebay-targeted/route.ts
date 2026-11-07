import { NextResponse } from "next/server";
import { fetchAll } from "@/lib/fetch-all";
import { authorized } from "@/lib/auth";
import { CARDS, normalize, setBySlug, type CatalogCard } from "@/lib/catalog";
import { MIN_PRICE, MIN_REF_VALUE } from "@/lib/config";
import { EBAY_EUR_MARKETS, ebayConfigured, searchEbayMarkets } from "@/lib/ebay";
import { recognize } from "@/lib/recognize";
import { loadReferences, resolveReference } from "@/lib/reference";
import { ebayProduct } from "@/lib/valuation";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Búsquedas por pasada. Cada búsqueda va a eBay España (+2.ª página si se llena) y Alemania:
 * 2–3 llamadas por búsqueda, ≈60 por pasada; deja margen en el límite diario de eBay (5.000 llamadas).
 */
const MAX_QUERIES = 22;
/** Anuncios de Vinted de los últimos días cuyas cartas buscamos en eBay. */
const VINTED_DAYS = 7;

const cardById = new Map(CARDS.map((c) => [c.id, c]));

/** Graduadas y lotes: el reconocedor las descarta, así que se quitan ya en eBay para no gastar los 200 resultados. */
const EXCLUDE = "-psa -bgs -sgc -pca -lot -lote";
/** Productos "Chrome": en eBay "jugador + topps chrome" trae de todo (Euro, MLS, Mundial, graduadas…). */
const CHROME_FAMILY = new Set(["topps chrome", "stadium club chrome", "topps chrome sapphire", "topps chrome bundesliga"]);

/**
 * Búsqueda en eBay para una carta: "jugador + producto" y, en los productos Chrome, además la competición
 * (paréntesis = "cualquiera de estas palabras" en eBay) y sin graduadas ni lotes.
 * Devuelve la búsqueda afinada y la simple (por si la afinada no trae nada).
 */
function targetedQuery(card: CatalogCard): { q: string; plain: string } | null {
  const p = ebayProduct(card);
  if (!p) return null;
  const plain = `${normalize(card.player)} ${p}`;
  if (!CHROME_FAMILY.has(p)) return { q: plain, plain };
  const comp = setBySlug.get(card.set_slug)?.competition ?? "";
  const extra = /uefa|champions/i.test(comp) ? " (uefa,ucc,champions)" : /premier/i.test(comp) ? " (premier,epl)" : "";
  return { q: `${plain}${extra} ${EXCLUDE}`, plain };
}


/**
 * GET /api/ebay-targeted   (cabecera x-alert-secret: <ALERT_SECRET>)
 * Referencias a medida: para las cartas que han salido en Vinted y aún no tienen precio
 * de referencia EXACTO, busca en eBay (España y Alemania, en euros) "jugador + producto" (p. ej. "lamine yamal topps chrome").
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
  const { data, error } = await fetchAll<{ card_id: string; parallel: string | null; price: number }>((from, to) =>
    db
      .from("listings")
      .select("card_id,parallel,price")
      .eq("platform", "vinted")
      .gte("seen_at", since)
      .order("external_id")
      .range(from, to),
  );
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Cartas (y variante) vistas en Vinted, sin referencia exacta
  // (y si alguno de sus anuncios en Vinted es de ≥ 10 €: esas van primero, las baratas no interesan)
  const wanted = new Map<string, { card: CatalogCard; parallel: string | null; pricey: boolean }>();
  for (const r of data ?? []) {
    const card = cardById.get(r.card_id);
    if (!card) continue;
    const k = `${r.card_id}|${r.parallel ?? ""}`;
    const pricey = Number(r.price) >= MIN_REF_VALUE || wanted.get(k)?.pricey === true;
    wanted.set(k, { card, parallel: r.parallel ?? null, pricey });
  }
  const refs = await loadReferences(db, [...new Set([...wanted.values()].map((w) => w.card.id))]);
  const missing = [...wanted.values()].filter(({ card, parallel }) => resolveReference(refs, card, parallel)?.level !== 1);

  // Una búsqueda por jugador + producto; primero las que tienen más cartas de ≥ 10 € sin referencia
  const queries = new Map<string, { plain: string; pricey: number; n: number }>();
  for (const { card, pricey } of missing) {
    const t = targetedQuery(card);
    if (!t) continue;
    const e = queries.get(t.q) ?? { plain: t.plain, pricey: 0, n: 0 };
    e.n++;
    if (pricey) e.pricey++;
    queries.set(t.q, e);
  }
  const all = [...queries.entries()]
    .sort((a, b) => b[1].pricey - a[1].pricey || b[1].n - a[1].n || a[0].localeCompare(b[0]))
    .map(([q]) => q);
  // Rotación: cada pasada (GitHub la lanza más o menos cada hora) sigue por donde se quedó la anterior.
  // 3 de cada 4 búsquedas van a cartas con anuncios de ≥ 10 €; el resto, a las demás.
  const hour = Math.floor(Date.now() / 3_600_000);
  const rotate = (list: string[], n: number) => {
    if (!list.length || n <= 0) return [];
    const off = (hour * n) % list.length;
    return [...list.slice(off), ...list.slice(0, off)].slice(0, n);
  };
  const pricey = all.filter((q) => queries.get(q)!.pricey > 0);
  const cheap = all.filter((q) => queries.get(q)!.pricey === 0);
  const nPricey = Math.min(pricey.length, cheap.length ? Math.round(MAX_QUERIES * 0.75) : MAX_QUERIES);
  const batch = [...rotate(pricey, nPricey), ...rotate(cheap, MAX_QUERIES - nPricey)];

  let saved = 0;
  const report: Record<string, unknown>[] = [];
  for (const q of batch) {
    if (Date.now() - started > 50_000) break;
    try {
      let { items, byMarket } = await searchEbayMarkets(q, EBAY_EUR_MARKETS, { limit: 200 });
      // Si la búsqueda afinada no trae nada (eBay no la entiende), se repite la simple
      const plain = queries.get(q)!.plain;
      let used = q;
      if (!items.length && plain !== q) {
        ({ items, byMarket } = await searchEbayMarkets(plain, EBAY_EUR_MARKETS, { limit: 200 }));
        used = plain;
      }
      const now = new Date().toISOString();
      const rows = [];
      const why: Record<string, number> = {};
      const samples: string[] = [];
      for (const it of items) {
        if (it.price < MIN_PRICE) continue;
        const { match, reason } = recognize(it.title);
        if (!match || match.confidence !== "alta") {
          const r = reason ?? (match ? `confianza ${match.confidence}` : "?");
          why[r] = (why[r] ?? 0) + 1;
          if (samples.length < 4 && /colecci|jugador/.test(r)) samples.push(it.title.slice(0, 90));
          continue;
        }
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
      report.push({ q: used, seen: items.length, by_market: byMarket, recognized: rows.length, why, samples });
    } catch (e) {
      report.push({ q, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({
    ok: true,
    vinted_cards: wanted.size,
    without_exact_ref: missing.length,
    queries_total: all.length,
    queries_pricey: [...queries.values()].filter((e) => e.pricey > 0).length,
    queries_done: report.length,
    references_saved: saved,
    report,
  });
}
