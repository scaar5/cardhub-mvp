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
 *
 * Enfoque del catálogo (v0.7): solo gama alta, media-alta, rookies y torneos de selecciones,
 * de la temporada 2021-22 en adelante. Nada de Match Attax, Megacracks, Adrenalyn ni flagship.
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

// Productos de Topps que se parecen a los del catálogo pero son otros (o aún no están en él)
const OTHER_TOPPS = [
  "stadium club", "stadium", "sapphire", "museum", "pristine", "classics", "cosmic", "x mls", "topps now", "reverence", "carnaval", "simplicidad",
  "total football", "collector tin", "tin", "dynasty", "inception", "deco", "gold premier league",
  "topps gold", "women", "womens", "uwcl", "wsl", "nwsl", "bundesliga", "serie a", "calciatori",
  "liga portugal", "mls", "nba", "nfl", "f1", "formula 1", "uefa euro", "euro 2024", "nations league",
  "club world cup", "mundial de clubes", "eredivisie", "spfl", "j league", "sticker", "stickers", "pokemon",
  "match attax", "heritage", "flashback", "flashbacks", "road to", "knockout", "superstars", "jade", "japan edition",
];

const UCC_WORDS = ["ucc", "ucl", "uefa", "champions league", "club competitions"];

/** OTHER_TOPPS sin las palabras del propio producto. */
const others = (...allow: string[]) => OTHER_TOPPS.filter((w) => !allow.includes(w));

/**
 * Productos UEFA "aparte" (fase 2): Stadium Club Chrome, Chrome Sapphire, Inception, Museum Collection.
 * El título debe decir el producto (all); si no dice UEFA/UCC, cuenta como "weak" (exige número o club).
 */
function uefaProduct(prefix: string, season: string, words: string[], allow: string[], ebay: string[], vinted: string[] = []): SetRule {
  const [a, b] = season.split("-");
  return {
    slug: `${prefix}-${season}`,
    searches: ebay.map((q) => `${q} ${a} ${b}`),
    vinted,
    any: UCC_WORDS,
    all: words,
    forbid: [...others(...allow), "premier league", "epl", "finest", "merlin", "summer signing"].filter((w) => !words.includes(w)),
    seasons: [season],
  };
}
const stadiumChrome = (season: string, vinted: string[] = []) =>
  uefaProduct("topps-stadium-club-chrome-ucc", season, ["stadium club", "chrome"], ["stadium club", "stadium"], ["topps stadium club chrome"], vinted);
const sapphireUcc = (season: string, vinted: string[] = []) =>
  uefaProduct("topps-chrome-sapphire-ucc", season, ["sapphire"], ["sapphire"], ["topps chrome sapphire uefa"], vinted);
const inceptionUcc = (season: string, vinted: string[] = []) =>
  uefaProduct("topps-inception-ucc", season, ["inception"], ["inception"], ["topps inception uefa"], vinted);
const museumUcc = (season: string, vinted: string[] = []) =>
  uefaProduct("topps-museum-collection-ucc", season, ["museum"], ["museum"], ["topps museum collection uefa"], vinted);

/** Topps Chrome Bundesliga (solo Chrome; el papel, Sapphire, Midnight, Gold... son otros productos). */
function chromeBundesliga(season: string, vinted: string[] = []): SetRule {
  const [a, b] = season.split("-");
  return {
    slug: `topps-chrome-bundesliga-${season}`,
    searches: [`topps chrome bundesliga ${a} ${b}`],
    vinted,
    any: ["bundesliga"],
    all: ["bundesliga", "chrome"], // "bundesliga" primero: all[0] es la "marca" para las hermanas de Chrome UCC
    forbid: [...others("bundesliga"), ...UCC_WORDS, "premier league", "epl", "finest", "merlin", "midnight", "international stars", "frauen", "summer signing"],
    seasons: [season],
  };
}

/** Topps Chrome UEFA (Champions League en 21-22, Club Competitions desde 22-23). */
function chromeUcc(season: string, vinted: string[]): SetRule {
  const [a, b] = season.split("-");
  return {
    slug: `topps-chrome-ucc-${season}`,
    searches: [`topps chrome ucc ${a} ${b}`, `topps chrome champions league ${a} ${b}`],
    vinted,
    any: UCC_WORDS,
    all: ["chrome"],
    forbid: [...OTHER_TOPPS, "premier league", "epl", "finest", "merlin", "summer signing"],
    seasons: [season],
  };
}

/** Topps Merlin Chrome UEFA. "Merlin Heritage" es otro producto (fase 2). */
function merlinUcc(season: string, vinted: string[], needUcc = false): SetRule {
  const [a, b] = season.split("-");
  return {
    slug: `topps-merlin-ucc-${season}`,
    searches: [`topps merlin chrome ${a} ${b}`, `topps merlin uefa ${a} ${b}`],
    vinted,
    // En 25-26 también existe Merlin Premier League: ahí se exige que el título diga UEFA/UCC
    any: needUcc ? UCC_WORDS : ["merlin"],
    all: needUcc ? ["merlin"] : undefined,
    forbid: [...OTHER_TOPPS, "premier league", "epl", "finest"],
    seasons: [season],
  };
}

/** Topps Finest UEFA. "Total Football" es un insert de Finest: no se prohíbe aquí. */
function finestUcc(season: string, vinted: string[]): SetRule {
  const [a, b] = season.split("-");
  return {
    slug: `topps-finest-ucc-${season}`,
    searches: [`topps finest ucc ${a} ${b}`, `topps finest champions league ${a} ${b}`],
    vinted,
    any: UCC_WORDS,
    all: ["finest"],
    forbid: [...OTHER_TOPPS.filter((w) => w !== "total football"), "premier league", "epl", "chrome", "merlin", "summer signing"],
    seasons: [season],
  };
}

export const SET_RULES: SetRule[] = [
  // --- Topps Chrome UCC ---------------------------------------------------
  chromeUcc("2025-26", ["topps chrome ucc 2025", "topps chrome 2025 26"]),
  chromeUcc("2024-25", ["topps chrome 2024 25"]),
  chromeUcc("2023-24", ["topps chrome 2023 24"]),
  chromeUcc("2022-23", ["topps chrome 2022 23"]),
  chromeUcc("2021-22", ["topps chrome 2021 22"]),

  // --- Topps Merlin Chrome UCC -------------------------------------------
  merlinUcc("2025-26", ["topps merlin 2025 26 uefa", "merlin ucc 2025"], true),
  merlinUcc("2024-25", ["topps merlin 2024 25"]),
  merlinUcc("2023-24", ["topps merlin 2023 24"]),
  merlinUcc("2022-23", ["topps merlin 2022 23"]),
  merlinUcc("2021-22", ["topps merlin 2021 22"]),

  // --- Topps Finest UCC --------------------------------------------------
  finestUcc("2025-26", ["topps finest 2025 26"]),
  finestUcc("2024-25", ["topps finest 2024 25"]),
  finestUcc("2023-24", ["topps finest 2023 24"]),
  finestUcc("2022-23", ["topps finest 2022 23"]),
  finestUcc("2021-22", ["topps finest 2021 22"]),

  // --- Topps Stadium Club Chrome UCC (checklistinsider: solo 23-24 y 25-26) -------------
  stadiumChrome("2025-26", ["stadium club chrome"]),
  stadiumChrome("2023-24"),

  // --- Topps Chrome Sapphire UCC (producto propio; Chrome normal lo sigue prohibiendo) ----
  sapphireUcc("2025-26"),
  sapphireUcc("2024-25", ["topps chrome sapphire"]),
  sapphireUcc("2023-24"),

  // --- Topps Inception / Museum Collection UCC -----------------------------
  inceptionUcc("2025-26"),
  inceptionUcc("2024-25", ["topps inception"]),
  inceptionUcc("2023-24"),
  museumUcc("2025-26", ["topps museum collection"]),
  museumUcc("2024-25"),
  museumUcc("2023-24"),

  // --- Topps Chrome Bundesliga ---------------------------------------------
  chromeBundesliga("2025-26", ["topps chrome bundesliga"]),
  chromeBundesliga("2024-25"),
  chromeBundesliga("2023-24"),

  // --- Premier League (Topps, solo desde 25-26) --------------------------
  {
    slug: "topps-chrome-premier-league-2025-26",
    searches: ["topps chrome premier league 2025 26"],
    vinted: ["topps chrome premier league"],
    any: ["premier league", "epl"],
    all: ["chrome"],
    forbid: [...OTHER_TOPPS, "finest", "merlin", "ucc", "uefa", "champions league"],
    seasons: ["2025-26"],
  },
  {
    slug: "topps-finest-premier-league-2025-26",
    searches: ["topps finest premier league 2025 26"],
    vinted: ["topps finest premier league"],
    any: ["premier league", "epl", "finest pl"],
    all: ["finest"],
    forbid: [...OTHER_TOPPS, "merlin", "ucc", "uefa", "champions league", "club competitions"],
    seasons: ["2025-26"],
  },
  {
    slug: "topps-merlin-premier-league-2025-26",
    searches: ["topps merlin premier league 2025 26"],
    vinted: ["topps merlin premier league"],
    any: ["merlin"],
    forbid: [...OTHER_TOPPS, "finest", "ucc", "uefa", "champions league", "club competitions"],
    seasons: ["2025-26"],
  },

  // --- Selecciones -------------------------------------------------------
  {
    slug: "panini-prizm-world-cup-2022",
    searches: ["panini prizm world cup 2022", "prizm qatar 2022"],
    vinted: ["prizm qatar 2022", "prizm world cup 2022"],
    any: ["world cup", "qatar", "mundial", "copa del mundo", "wc"],
    all: ["prizm"],
    forbid: ["adrenalyn", "topps", "megacracks", "donruss", "select", "fifa 365", "sticker", "stickers", "pokemon", "euro", "premier league", "epl", "club world cup", "mundial de clubes", "breakaway box"],
    seasons: ["2022"],
  },
];

export const ruleBySlug = new Map(SET_RULES.map((r) => [r.slug, r]));

/** Búsquedas de eBay y de Vinted, con la colección a la que pertenecen (pista para el reconocedor). */
export const EBAY_SEARCHES = SET_RULES.flatMap((r) => r.searches.map((q) => ({ q, set: r.slug })));
export const VINTED_SEARCHES = SET_RULES.flatMap((r) => r.vinted.map((q) => ({ q, set: r.slug })));
