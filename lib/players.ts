import { CARDS, normalize, setBySlug, type CatalogCard } from "./catalog";

/** Índice de jugadores del catálogo (para el buscador y la ficha de /jugadores). */

export interface PlayerEntry {
  slug: string; // "lamine-yamal"
  name: string; // nombre tal cual en el catálogo
  key: string; // nombre normalizado
  teams: string[];
  cards: CatalogCard[];
  rookie: boolean; // tiene alguna carta rookie
}

export const playerSlug = (name: string) => normalize(name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Apodos habituales → palabra que sí está en el nombre del catálogo
const ALIASES: Record<string, string> = {
  cr7: "cristiano",
  leo: "messi",
  kylian: "mbappe",
  lamine: "yamal",
  dembele: "dembele",
  junior: "jr",
  kdb: "bruyne",
  debruyne: "bruyne",
  pedri: "pedri",
  gavi: "gavi",
};

// Una carta doble/triple ("Lamine Yamal / Lionel Messi") cuenta para cada jugador.
// "Júnior" y "Jr" se tratan igual (Vinicius Jr = Vinícius Júnior).
const unify = (n: string) =>
  normalize(n)
    .replace(/\bjunior\b/g, "jr")
    .replace(/\bvinicius jr\b/g, "vini jr");
// Palabras extra para encontrar a un jugador por su nombre largo/corto
const EXTRA: Record<string, string> = { "vini jr": "vinicius junior" };
const map = new Map<string, PlayerEntry>();
const nameVotes = new Map<string, Map<string, number>>();
for (const c of CARDS) {
  const names = c.player.split("/").map((n) => n.trim()).filter(Boolean);
  for (const name of names) {
    const slug = playerSlug(unify(name));
    if (!slug) continue;
    let p = map.get(slug);
    if (!p) {
      p = { slug, name, key: unify(name), teams: [], cards: [], rookie: false };
      map.set(slug, p);
    }
    p.cards.push(c);
    if (c.rookie && names.length === 1) p.rookie = true;
    const team = c.team?.split("/")[0].trim();
    if (team && names.length === 1 && !p.teams.includes(team)) p.teams.push(team);
    const v = nameVotes.get(slug) ?? new Map<string, number>();
    v.set(name, (v.get(name) ?? 0) + 1);
    nameVotes.set(slug, v);
  }
}
// Nombre para mostrar: la forma más usada en el catálogo
for (const [slug, v] of nameVotes) map.get(slug)!.name = [...v.entries()].sort((a, b) => b[1] - a[1])[0][0];

export const PLAYERS = [...map.values()];
export const playerBySlug = map;

/** Busca jugadores: cada palabra debe ser el principio de alguna palabra del nombre (o de su club). */
export function searchPlayers(query: string, limit = 10): PlayerEntry[] {
  const words = normalize(query)
    .split(" ")
    .filter(Boolean)
    .map((w) => ALIASES[w] ?? w);
  if (!words.length) return [];
  const scored: { p: PlayerEntry; score: number }[] = [];
  for (const p of PLAYERS) {
    const nameTokens = `${p.key} ${EXTRA[p.key] ?? ""}`.trim().split(" ");
    const teamTokens = normalize(p.teams.join(" ")).split(" ");
    let score = 0;
    let ok = true;
    for (const w of words) {
      if (nameTokens.some((t) => t === w)) score += 3;
      else if (nameTokens.some((t) => t.startsWith(w))) score += 2;
      else if (w.length >= 3 && teamTokens.some((t) => t.startsWith(w))) score += 1;
      else if (w.length >= 4 && p.key.replace(/ /g, "").includes(w)) score += 0.5;
      else {
        ok = false;
        break;
      }
    }
    if (ok) scored.push({ p, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || b.p.cards.length - a.p.cards.length || a.p.name.localeCompare(b.p.name))
    .slice(0, limit)
    .map((s) => s.p);
}

/** Nombre de la colección + temporada de una carta, y orden (más reciente primero). */
export function cardSet(c: CatalogCard) {
  const s = setBySlug.get(c.set_slug);
  return { name: s?.name ?? c.set_slug, season: s?.season ?? "", brand: s?.brand ?? "" };
}
