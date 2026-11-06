/**
 * Cómo se reconoce cada colección del catálogo en el título de un anuncio,
 * y qué se busca en eBay y Vinted para encontrar sus cartas.
 *
 *  - searches: textos que el sniper busca en eBay (referencia de precio).
 *  - vinted:   textos que busca en Vinted (chollos). Vinted funciona mejor con búsquedas cortas.
 *  - any:      el título debe contener al menos una de estas frases...
 *  - all:      ...y todas estas (si hay).
 *  - forbid:   si aparece alguna, es otro producto (p. ej. "Stadium Club Chrome" no es "Chrome").
 *  - seasons:  temporadas que acepta. Si el título trae otra temporada, se descarta.
 *
 * Todo se compara en minúsculas, sin acentos y con "/" "-" "." convertidos en espacios.
 */
export interface SetRule {
  slug: string;
  searches: string[];
  vinted: string[];
  any: string[];
  all?: string[];
  forbid: string[];
  seasons: string[]; // "2025-26", o "2026" para un Mundial
}

// Productos que se parecen a los del catálogo pero son otros
const OTHER_TOPPS = [
  "stadium club", "stadium", "sapphire", "museum", "pristine", "classics", "cosmic", "x mls", "topps now", "reverence", "carnaval", "simplicidad",
  "total football", "collector tin", "tin", "dynasty", "inception", "deco", "gold premier league",
  "topps gold", "women", "womens", "uwcl", "wsl", "nwsl", "bundesliga", "serie a", "calciatori",
  "liga portugal", "mls", "nba", "nfl", "f1", "formula 1", "uefa euro", "euro 2024", "nations league",
  "club world cup", "mundial de clubes", "eredivisie", "spfl", "j league", "sticker", "stickers", "pokemon",
];
const OTHER_PANINI = [
  "megacracks", "mgk", "prizm", "donruss", "select", "chronicles", "obsidian", "immaculate",
  "fifa 365", "ligue 1", "champions league", "uefa", "ucl", "premier league", "bundesliga", "calcio",
  "serie a", "copa america", "euro", "liga este", "liga portugal", "eredivisie", "top class",
  "sticker", "stickers", "pokemon", "club world cup", "mundial de clubes",
];

export const SET_RULES: SetRule[] = [
  {
    slug: "topps-ucc-2025-26",
    searches: ["topps uefa club competitions 2025 26"],
    vinted: ["topps uefa club competitions 2025", "topps ucc 2025 26"],
    any: ["topps ucc", "topps uefa", "topps champions league", "club competitions", "flagship ucc"],
    all: ["topps"],
    forbid: [...OTHER_TOPPS, "chrome", "finest", "merlin", "match attax", "summer signing", "premier league", "cosmic"],
    seasons: ["2025-26"],
  },
  {
    slug: "topps-chrome-ucc-2025-26",
    searches: ["topps chrome ucc 2025 26", "topps chrome champions league 2025 26"],
    vinted: ["topps chrome ucc 2025", "topps chrome 2025 26"],
    any: ["ucc", "uefa", "champions league", "club competitions", "ucl"],
    all: ["chrome"],
    forbid: [...OTHER_TOPPS, "premier league", "finest", "merlin", "match attax", "summer signing", "cosmic"],
    seasons: ["2025-26"],
  },
  {
    slug: "topps-chrome-ucc-2024-25",
    searches: ["topps chrome ucc 2024 25", "topps chrome champions league 2024 25"],
    vinted: ["topps chrome 2024 25"],
    any: ["ucc", "uefa", "champions league", "club competitions", "ucl"],
    all: ["chrome"],
    forbid: [...OTHER_TOPPS, "premier league", "finest", "merlin", "match attax", "summer signing", "cosmic"],
    seasons: ["2024-25"],
  },
  {
    slug: "topps-summer-signings-ucc-2026-27",
    searches: ["topps summer signings 2026 27"],
    vinted: ["topps summer signings"],
    any: ["summer signing", "summer signings"],
    forbid: OTHER_TOPPS,
    seasons: ["2026-27"],
  },
  {
    slug: "topps-match-attax-ucc-2026-27",
    searches: ["match attax 2026 27", "match attax 26 27"],
    vinted: ["match attax 2026", "match attax 26 27"],
    any: ["match attax"],
    forbid: [
      ...OTHER_TOPPS,
      "premier league", "epl", "extra", "chrome", "101",
    ],
    seasons: ["2026-27"],
  },
  {
    slug: "topps-premier-league-2025-26",
    searches: ["topps premier league 2025 26", "topps flagship premier league 2025"],
    vinted: ["topps premier league 2025"],
    any: ["premier league", "epl"],
    all: ["topps"],
    forbid: [...OTHER_TOPPS, "chrome", "finest", "merlin", "match attax", "ucc", "uefa", "champions league"],
    seasons: ["2025-26"],
  },
  {
    slug: "topps-chrome-premier-league-2025-26",
    searches: ["topps chrome premier league 2025 26"],
    vinted: ["topps chrome premier league"],
    any: ["premier league", "epl"],
    all: ["chrome"],
    forbid: [...OTHER_TOPPS, "finest", "merlin", "match attax", "ucc", "uefa", "champions league"],
    seasons: ["2025-26"],
  },
  {
    slug: "topps-finest-premier-league-2025-26",
    searches: ["topps finest premier league 2025 26"],
    vinted: ["topps finest premier league"],
    any: ["premier league", "epl", "finest pl"],
    all: ["finest"],
    forbid: [...OTHER_TOPPS, "merlin", "match attax", "ucc", "uefa", "champions league", "club competitions"],
    seasons: ["2025-26"],
  },
  {
    slug: "topps-merlin-premier-league-2025-26",
    searches: ["topps merlin premier league 2025 26"],
    vinted: ["topps merlin 2025"],
    any: ["merlin"],
    forbid: [...OTHER_TOPPS, "finest", "match attax", "ucc", "uefa", "champions league", "club competitions"],
    seasons: ["2025-26"],
  },
  {
    slug: "panini-adrenalyn-laliga-2025-26",
    searches: ["adrenalyn xl 2025 26", "adrenalyn 25 26 laliga"],
    vinted: ["adrenalyn 25 26", "adrenalyn 2025 2026"],
    any: ["adrenalyn"],
    forbid: [...OTHER_PANINI, "mundial", "world cup", "wc 2026", "fifa world cup"],
    seasons: ["2025-26"],
  },
  {
    slug: "panini-adrenalyn-world-cup-2026",
    searches: ["adrenalyn mundial 2026", "adrenalyn world cup 2026"],
    vinted: ["adrenalyn mundial 2026"],
    any: ["mundial", "world cup", "wc 2026", "copa del mundo"],
    all: ["adrenalyn"],
    forbid: [...OTHER_PANINI.filter((w) => w !== "euro"), "laliga", "la liga", "liga ea"],
    seasons: ["2026"],
  },
];

export const ruleBySlug = new Map(SET_RULES.map((r) => [r.slug, r]));

/** Búsquedas de eBay y de Vinted, con la colección a la que pertenecen (pista para el reconocedor). */
export const EBAY_SEARCHES = SET_RULES.flatMap((r) => r.searches.map((q) => ({ q, set: r.slug })));
export const VINTED_SEARCHES = SET_RULES.flatMap((r) => r.vinted.map((q) => ({ q, set: r.slug })));
