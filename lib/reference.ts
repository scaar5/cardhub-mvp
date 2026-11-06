import type { SupabaseClient } from "@supabase/supabase-js";
import { CARDS, normalize, setBySlug, type CatalogCard } from "./catalog";
import { MIN_REF_SAMPLE, REF_DAYS } from "./config";
import { median } from "./market";

export interface Reference {
  value: number; // mediana en €
  sample: number; // nº de anuncios de eBay
}

/** Referencia elegida para un anuncio, con el nivel de la cascada que la dio. */
export interface ResolvedReference extends Reference {
  /** 1 = exacta · 2 = colección hermana, misma numeración · 3 = misma colección, numeración cercana */
  level: 1 | 2 | 3;
  cardId: string;
  parallel: string | null;
  /** Texto legible de la carta usada como referencia (solo en niveles 2 y 3). */
  basedOn?: string;
}

export const refKey = (cardId: string, parallel: string | null) => `${cardId}|${parallel ?? ""}`;

/** "Blue /150" → 150 · "/99" → 99 · "Refractor" → null */
export function printRun(parallel: string | null): number | null {
  const m = parallel?.match(/\/\s*(\d{1,4})\s*$/);
  return m ? Number(m[1]) : null;
}

/** Tipo de carta, para no comparar un autógrafo con una base. */
function kind(card: CatalogCard): string {
  const s = normalize(card.subset);
  if (/\b(auto|autos|autograph|autographs|signature|signatures|firma|firmas)\b/.test(s)) return "auto";
  if (/\b(patch|relic|relics|match ball|memorabilia)\b/.test(s)) return "relic";
  if (card.subset === "Base") return "base";
  return `insert:${s}`; // los inserts solo se comparan con un insert del mismo nombre
}

/** Jugador + temporada + competición → cartas del mismo tipo en todas las colecciones. */
const siblingIndex = new Map<string, CatalogCard[]>();
const siblingKey = (c: CatalogCard) => {
  const set = setBySlug.get(c.set_slug);
  return [normalize(c.player), set?.season ?? "", set?.competition ?? "", kind(c)].join("|");
};
for (const c of CARDS) {
  const k = siblingKey(c);
  const list = siblingIndex.get(k) ?? [];
  list.push(c);
  siblingIndex.set(k, list);
}

/** Misma carta (jugador, temporada, competición, tipo) en las otras colecciones. */
export function siblingCards(card: CatalogCard): CatalogCard[] {
  return (siblingIndex.get(siblingKey(card)) ?? []).filter((c) => c.set_slug !== card.set_slug);
}

const cardById = new Map(CARDS.map((c) => [c.id, c]));

export function cardLabel(card: CatalogCard, parallel: string | null): string {
  const set = setBySlug.get(card.set_slug);
  return `${card.player} · ${set?.name ?? card.set_slug} #${card.number}${
    card.subset !== "Base" ? ` (${card.subset})` : ""
  }${parallel ? ` · ${parallel}` : ""}`;
}

/** Ids de todas las cartas cuya referencia puede hacer falta (la propia + sus hermanas). */
export function candidateCardIds(cards: CatalogCard[]): string[] {
  const ids = new Set<string>();
  for (const c of cards) {
    ids.add(c.id);
    for (const s of siblingCards(c)) ids.add(s.id);
  }
  return [...ids];
}

/**
 * Precios de referencia de eBay agrupados por carta: cardId → [{ parallel, value, sample }].
 * Solo las variantes con al menos MIN_REF_SAMPLE anuncios en los últimos REF_DAYS días.
 */
export async function loadReferences(
  db: SupabaseClient,
  cardIds: string[],
): Promise<Map<string, (Reference & { parallel: string | null })[]>> {
  const out = new Map<string, (Reference & { parallel: string | null })[]>();
  if (cardIds.length === 0) return out;
  const since = new Date(Date.now() - REF_DAYS * 86400_000).toISOString();

  const prices = new Map<string, { cardId: string; parallel: string | null; list: number[] }>();
  const ids = [...new Set(cardIds)];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db
      .from("listings")
      .select("card_id,parallel,price")
      .eq("platform", "ebay")
      .gte("seen_at", since)
      .in("card_id", ids.slice(i, i + 200))
      .limit(10000);
    if (error) throw new Error(`listings: ${error.message}`);
    for (const r of data ?? []) {
      const k = refKey(r.card_id, r.parallel);
      const e = prices.get(k) ?? { cardId: r.card_id as string, parallel: (r.parallel ?? null) as string | null, list: [] as number[] };
      e.list.push(Number(r.price));
      prices.set(k, e);
    }
  }
  for (const { cardId, parallel, list } of prices.values()) {
    if (list.length < MIN_REF_SAMPLE) continue;
    const arr = out.get(cardId) ?? [];
    arr.push({ parallel, value: Math.round(median(list) * 100) / 100, sample: list.length });
    out.set(cardId, arr);
  }
  return out;
}

/**
 * Cascada de referencia:
 *   1. Exacta: misma carta y misma variante (o misma numeración /N aunque el color se escriba distinto).
 *   2. Colección hermana: mismo jugador, temporada y tipo de carta, misma numeración /N
 *      (o la misma variante sin numerar) en otra colección (p. ej. Merlin Chrome /150 → Topps Chrome /150).
 *   3. Numeración cercana: misma carta, la variante numerada más próxima (p. ej. /150 → /125 o /199).
 * Dentro de cada nivel se elige la referencia con más anuncios.
 */
export function resolveReference(
  refs: Map<string, (Reference & { parallel: string | null })[]>,
  card: CatalogCard,
  parallel: string | null,
): ResolvedReference | null {
  const run = printRun(parallel);
  const sameVariant = (p: string | null) =>
    run !== null ? printRun(p) === run : (p ?? "") === (parallel ?? "");
  const best = <T extends Reference>(list: T[]) => list.sort((a, b) => b.sample - a.sample)[0];

  // 1) Exacta
  const own = refs.get(card.id) ?? [];
  const exact =
    own.find((r) => (r.parallel ?? "") === (parallel ?? "")) ?? best(own.filter((r) => sameVariant(r.parallel)));
  if (exact) return { ...exact, level: 1, cardId: card.id };

  // 2) Colección hermana, misma numeración
  const fromSiblings = siblingCards(card).flatMap((s) =>
    (refs.get(s.id) ?? []).filter((r) => sameVariant(r.parallel)).map((r) => ({ ...r, cardId: s.id })),
  );
  const sib = best(fromSiblings);
  if (sib) {
    const c = cardById.get(sib.cardId)!;
    return { ...sib, level: 2, basedOn: cardLabel(c, sib.parallel) };
  }

  // 3) Misma colección, numeración más cercana (solo si la carta es numerada)
  if (run !== null) {
    const near = own
      .map((r) => ({ ...r, run: printRun(r.parallel) }))
      .filter((r) => r.run !== null && r.run !== run)
      .sort((a, b) => Math.abs(a.run! - run) - Math.abs(b.run! - run) || b.sample - a.sample)[0];
    if (near) {
      const { run: _run, ...r } = near;
      return { ...r, level: 3, cardId: card.id, basedOn: cardLabel(card, r.parallel) };
    }
  }
  return null;
}
