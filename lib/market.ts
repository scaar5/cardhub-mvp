import { MIN_PRICE, MIN_SAMPLE } from "./config";
import { searchEbay, type EbayItem } from "./ebay";

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Valor de mercado = mediana de precios de anuncios comparables en eBay.es.
 * Se recortan el 10 % más barato y el 10 % más caro para quitar extremos.
 */
export function marketValueFrom(items: EbayItem[]): { value: number; sample: number } {
  const prices = items.map((i) => i.price).filter((p) => p >= MIN_PRICE).sort((a, b) => a - b);
  const cut = Math.floor(prices.length * 0.1);
  const trimmed = prices.slice(cut, prices.length - cut || undefined);
  return { value: Math.round(median(trimmed) * 100) / 100, sample: trimmed.length };
}

/** Busca comparables en eBay para un texto y devuelve su valor de mercado. */
export async function estimateMarketValue(query: string) {
  const items = await searchEbay(query, { limit: 100 });
  const { value, sample } = marketValueFrom(items);
  return { value, sample, reliable: sample >= MIN_SAMPLE };
}
