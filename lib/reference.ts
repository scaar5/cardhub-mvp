import type { SupabaseClient } from "@supabase/supabase-js";
import { MIN_REF_SAMPLE, REF_DAYS } from "./config";
import { median } from "./market";

export interface Reference {
  value: number; // mediana en €
  sample: number; // nº de anuncios de eBay
}

export const refKey = (cardId: string, parallel: string | null) => `${cardId}|${parallel ?? ""}`;

/**
 * Precio de referencia de cada (carta, variante) a partir de los anuncios de eBay guardados.
 * Devuelve solo las que tienen al menos MIN_REF_SAMPLE anuncios.
 */
export async function loadReferences(
  db: SupabaseClient,
  cardIds: string[],
): Promise<Map<string, Reference>> {
  const out = new Map<string, Reference>();
  if (cardIds.length === 0) return out;
  const since = new Date(Date.now() - REF_DAYS * 86400_000).toISOString();

  const prices = new Map<string, number[]>();
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
      const list = prices.get(k) ?? [];
      list.push(Number(r.price));
      prices.set(k, list);
    }
  }
  for (const [k, list] of prices) {
    if (list.length >= MIN_REF_SAMPLE) {
      out.set(k, { value: Math.round(median(list) * 100) / 100, sample: list.length });
    }
  }
  return out;
}
