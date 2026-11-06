import type { SupabaseClient } from "@supabase/supabase-js";
import { normalize, setBySlug, type CatalogCard } from "./catalog";
import { EBAY_MIN_SAMPLE, MIN_PRICE, REF_DAYS, RELIABLE_SAMPLE, SOLD_DAYS } from "./config";
import { searchEbay } from "./ebay";
import { isComparable } from "./filters";
import { flat, recognize, type Recognition } from "./recognize";
import {
  candidateCardIds,
  cardLabel,
  loadReferences,
  printRun,
  resolveReference,
  type ResolvedReference,
} from "./reference";

/**
 * Valoración de un anuncio pegado a mano (página "Valorar").
 *
 * Usa el MISMO camino que las alertas del sniper:
 *   1. Reconoce la carta exacta y su paralela (lib/recognize.ts).
 *   2. Busca la referencia en cascada (ventas reales de Vinted → anuncios de eBay) en la base de datos.
 *   3. Si no hay referencia exacta, busca en eBay "jugador + producto" en ese momento, reconoce cada
 *      anuncio y solo cuenta los de la MISMA carta y numeración (y los guarda, como /api/ebay-targeted).
 *   4. Si la carta no está en el catálogo: búsqueda de texto ESTRICTA en eBay (mismas palabras, misma
 *      numeración /N, firmada o no). El resultado se marca como aproximado.
 *   5. Si nada de lo anterior da datos suficientes: NO se da precio ("No puedo valorarla con fiabilidad").
 */

export interface Comparable {
  title: string;
  price: number;
  url: string | null;
  date: string | null;
  platform: "vinted_sold" | "ebay";
}

export interface Valuation {
  /** Carta reconocida en el catálogo (o null si no está). */
  recognition: Recognition | null;
  label: string | null;
  /** Referencia elegida, o null si no hay datos fiables. */
  ref:
    | (Pick<ResolvedReference, "value" | "sample" | "source" | "basedOn"> & {
        level: 1 | 2 | 3 | null; // null = búsqueda de texto (carta fuera del catálogo)
        cardId: string | null;
        parallel: string | null;
      })
    | null;
  /** true = la referencia sale de una búsqueda de texto, no de la carta exacta del catálogo. */
  approximate: boolean;
  comparables: Comparable[];
  /** Qué se buscó en eBay en directo (si se buscó). */
  searched: string[];
  /** Por qué no hay valoración (si ref es null). */
  reason?: string;
}

/** Producto en palabras que salen en casi todos los títulos ("topps chrome", "prizm world cup"…). */
export function ebayProduct(card: CatalogCard): string | null {
  const s = card.set_slug;
  if (s.startsWith("topps-chrome-")) return "topps chrome";
  if (s.startsWith("topps-merlin-")) return "topps merlin";
  if (s.startsWith("topps-finest-")) return "topps finest";
  if (s.startsWith("panini-prizm-world-cup-")) return "prizm world cup";
  return null;
}

/** Misma regla que loadReferences(): con pocos anuncios el más barato; con más, el percentil 25. */
function askingPriceRef(prices: number[]): number {
  const sorted = [...prices].sort((a, b) => a - b);
  const v = prices.length < RELIABLE_SAMPLE ? sorted[0] : sorted[Math.floor((sorted.length - 1) * 0.25)];
  return Math.round(v * 100) / 100;
}

/** Numeraciones "/N" de un título, sin confundir temporadas ("2020/21") con numeraciones. */
export function printRunsIn(title: string): number[] {
  const out: number[] = [];
  for (const m of title.matchAll(/(\d*)\s*\/\s*(\d{1,4})(?!\d)/g)) {
    const before = m[1];
    const after = m[2];
    if (/^(19|20)\d\d$/.test(before) && (after.length === 2 || /^(19|20)\d\d$/.test(after))) continue; // temporada
    out.push(Number(after));
  }
  return out;
}

const AUTO_RE = /\b(auto|autos|autograph|autografo|autografiada|autografiado|firmada|firmado|signed|signature)\b/;
const RELIC_RE = /\b(patch|relic|parche|jersey|memorabilia)\b/;
const STOP = new Set([
  "rookie", "rc", "card", "cards", "carta", "cartas", "cromo", "cromos", "the", "and", "con", "del", "los", "las",
  "una", "uno", "for", "new", "nueva", "nuevo", "mint", "numerada", "numbered", "serial", "ssp", "sp", "ucc",
  "uefa", "champions", "league", "liga", "football", "futbol", "soccer", "trading", "tarjeta",
]);

/** Palabras que tienen que salir sí o sí en el anuncio de eBay para contarlo (búsqueda de texto). */
function requiredWords(query: string): string[] {
  return [...new Set(flat(query).split(" "))].filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !STOP.has(w));
}

/** Búsqueda de texto estricta en eBay, para cartas fuera del catálogo. */
async function textValuation(query: string): Promise<{ ref: Valuation["ref"]; comparables: Comparable[]; reason?: string }> {
  const words = requiredWords(query);
  if (words.length < 2) return { ref: null, comparables: [], reason: "El título es demasiado corto para buscarlo con precisión." };
  const runs = printRunsIn(query);
  const wantAuto = AUTO_RE.test(flat(query));
  const wantRelic = RELIC_RE.test(flat(query));

  // En eBay se busca solo con las palabras importantes (sin "rookie", "/299"…), y la numeración se filtra aquí
  const items = await searchEbay(words.join(" "), { limit: 200 });
  // Con 4 o más palabras se permite que falte una (p. ej. el nombre de pila: "Bellingham" sin "Jude")
  const allowMissing = words.length >= 4 ? 1 : 0;
  const comps: Comparable[] = [];
  for (const it of items) {
    if (it.price < MIN_PRICE || !isComparable(it.title)) continue;
    const t = flat(it.title);
    const tw = new Set(t.split(" "));
    if (words.filter((w) => !tw.has(w)).length > allowMissing) continue; // las palabras importantes
    const itRuns = printRunsIn(it.title);
    if (runs.length ? !itRuns.some((r) => runs.includes(r)) : itRuns.length > 0) continue; // misma numeración
    if (AUTO_RE.test(t) !== wantAuto || RELIC_RE.test(t) !== wantRelic) continue; // firmada / parche igual
    comps.push({ title: it.title, price: it.price, url: it.url, date: null, platform: "ebay" });
  }
  if (comps.length < EBAY_MIN_SAMPLE) {
    return {
      ref: null,
      comparables: comps,
      reason:
        comps.length === 0
          ? "No hay anuncios en eBay España de esta misma carta."
          : `Solo hay ${comps.length} anuncio${comps.length > 1 ? "s" : ""} en eBay España de esta misma carta (mínimo ${EBAY_MIN_SAMPLE}).`,
    };
  }
  return {
    ref: {
      value: askingPriceRef(comps.map((c) => c.price)),
      sample: comps.length,
      source: "ebay",
      level: null,
      cardId: null,
      parallel: null,
    },
    comparables: comps.sort((a, b) => a.price - b.price),
  };
}

/** Ventas / anuncios guardados que forman la referencia (para enseñarlos con su enlace). */
async function loadComparables(db: SupabaseClient, ref: ResolvedReference): Promise<Comparable[]> {
  const days = ref.source === "vinted_sold" ? SOLD_DAYS : REF_DAYS;
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  let q = db
    .from("listings")
    .select("title,price,url,seen_at,parallel")
    .eq("platform", ref.source)
    .eq("card_id", ref.cardId)
    .gte("seen_at", since)
    .order("seen_at", { ascending: false })
    .limit(200);
  q = ref.parallel === null ? q.is("parallel", null) : q.eq("parallel", ref.parallel);
  const { data } = await q;
  return (data ?? [])
    .map((r) => ({
      title: r.title,
      price: Number(r.price),
      url: r.url ?? null,
      date: r.seen_at ?? null,
      platform: ref.source,
    }))
    .sort((a, b) => a.price - b.price);
}

/** Búsqueda en directo en eBay de "jugador + producto"; guarda los anuncios reconocidos en listings. */
async function liveEbayForCard(db: SupabaseClient, card: CatalogCard): Promise<string | null> {
  const product = ebayProduct(card) ?? normalize(setBySlug.get(card.set_slug)?.name ?? "");
  if (!product) return null;
  const q = `${normalize(card.player)} ${product}`;
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
  if (rows.length) await db.from("listings").upsert(rows, { onConflict: "external_id" });
  return q;
}

export async function valuate(db: SupabaseClient, title: string, customQuery?: string): Promise<Valuation> {
  const searched: string[] = [];
  const { match } = recognize(title);

  if (match) {
    const card = match.card;
    const label = cardLabel(card, match.parallel);
    const ids = candidateCardIds([card]);
    let ref = resolveReference(await loadReferences(db, ids), card, match.parallel);

    // Sin referencia exacta: buscar en eBay ahora mismo y volver a calcular
    if (!ref || ref.level > 1) {
      try {
        const q = await liveEbayForCard(db, card);
        if (q) {
          searched.push(q);
          ref = resolveReference(await loadReferences(db, ids), card, match.parallel);
        }
      } catch {
        // eBay caído: seguimos con lo que haya en la base de datos
      }
    }

    if (ref) {
      return {
        recognition: match,
        label,
        ref: {
          value: ref.value,
          sample: ref.sample,
          source: ref.source,
          basedOn: ref.basedOn,
          level: ref.level,
          cardId: ref.cardId,
          parallel: ref.parallel,
        },
        approximate: false,
        comparables: await loadComparables(db, ref),
        searched,
      };
    }

    // Carta reconocida pero sin datos: probar la búsqueda de texto estricta
    const text = await textValuation(customQuery || title);
    searched.push(customQuery || title);
    return {
      recognition: match,
      label,
      ref: text.ref,
      approximate: !!text.ref,
      comparables: text.comparables,
      searched,
      reason: text.ref ? undefined : `${label}: aún no hay ventas ni anuncios suficientes de esta carta. ${text.reason ?? ""}`.trim(),
    };
  }

  // Carta fuera del catálogo: búsqueda de texto estricta
  const q = customQuery || title;
  searched.push(q);
  const text = await textValuation(q);
  return {
    recognition: null,
    label: null,
    ref: text.ref,
    approximate: !!text.ref,
    comparables: text.comparables,
    searched,
    reason: text.ref
      ? undefined
      : `No reconozco esta carta en el catálogo y en eBay no hay datos suficientes. ${text.reason ?? ""}`.trim(),
  };
}
