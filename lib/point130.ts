import { SETS, type CatalogCard } from "./catalog";
import { ebayProduct } from "./valuation";

const setBySlug = new Map(SETS.map((s) => [s.slug, s]));

/**
 * Texto de búsqueda para 130point (ventas de eBay) de una carta concreta:
 * "2023-24 topps merlin Lamine Yamal 27 Refractor".
 * Los números sintéticos del catálogo (U…) no aparecen en los anuncios, así que no se ponen.
 */
export function point130Query(card: CatalogCard, parallel: string | null): string {
  const set = setBySlug.get(card.set_slug);
  const product = ebayProduct(card) ?? set?.name.replace(/\s*\d{4}(-\d{2})?\s*$/, "") ?? "";
  const number = /^U/.test(card.number) ? "" : card.number;
  return [set?.season, product, card.player, number, parallel]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Enlace a la búsqueda de ventas de 130point. Si 130point no rellena la búsqueda, el texto va aparte para copiarlo. */
export function point130Url(query: string): string {
  return `https://130point.com/sales/?q=${encodeURIComponent(query)}`;
}
