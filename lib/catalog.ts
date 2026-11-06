import data from "./catalog-data.json";

/** Catálogo de cartas generado desde data/catalog/*.txt (ver scripts/build-catalog.mjs). */

export interface CatalogSet {
  slug: string;
  name: string;
  brand: string;
  season: string;
  competition: string | null;
  aliases: string[];
  parallels: string[];
  card_count: number;
}

export interface CatalogCard {
  id: string;
  set_slug: string;
  number: string;
  player: string;
  team: string | null;
  subset: string;
  rookie: boolean;
  search_text: string;
}

export const SETS = data.sets as CatalogSet[];
export const CARDS = data.cards as CatalogCard[];
export const setBySlug = new Map(SETS.map((s) => [s.slug, s]));

export const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ø/gi, "o")
    .replace(/ł/gi, "l")
    .toLowerCase()
    .replace(/[^a-z0-9/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Búsqueda simple: todas las palabras deben aparecer (jugador, equipo, colección, subserie o número). */
export function searchCards(query: string, opts: { set?: string; limit?: number } = {}) {
  const words = normalize(query).split(" ").filter(Boolean);
  const limit = opts.limit ?? 60;
  const results: CatalogCard[] = [];
  let total = 0;
  for (const c of CARDS) {
    if (opts.set && c.set_slug !== opts.set) continue;
    if (words.length && !words.every((w) => c.search_text.includes(w))) continue;
    total++;
    if (results.length < limit) results.push(c);
  }
  return { results, total };
}
