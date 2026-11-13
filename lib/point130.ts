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

/** 130point NO lee la búsqueda desde la URL (comprobado por el usuario, 13-nov): solo abre su buscador. */
export const POINT130_URL = "https://130point.com/sales/";

/** Ventas terminadas de eBay (los mismos datos que 130point), en eBay.com, que sí acepta la búsqueda en la URL. */
export function ebaySoldUrl(query: string): string {
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1&_sop=13`;
}
