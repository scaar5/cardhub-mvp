/**
 * Reconocedor de anuncios: a partir del título de un anuncio (eBay, Vinted...)
 * averigua qué carta del catálogo es y en qué variante (Refractor, Gold /50...).
 *
 *   recognize("Topps Chrome UCC 2025/26 Lamine Yamal Refractor #10")
 *   → { card: {id: "topps-chrome-ucc-2025-26:10", ...}, parallel: "Refractor", confidence: "alta" }
 *
 * Es conservador a propósito: si duda entre dos cartas, devuelve null.
 * Mejor no reconocer un anuncio que mezclar precios de cartas distintas.
 *
 * Confianza:
 *   - "alta":  colección y temporada aparecen en el título.
 *   - "media": la colección aparece pero la temporada no, y coincide con la búsqueda
 *              con la que se encontró el anuncio (pista). Se guarda, pero no se usa
 *              para calcular precios ni para mandar alertas.
 */
import { CARDS, SETS, type CatalogCard } from "./catalog";
import { excludedReason } from "./filters";
import { SET_RULES, type SetRule } from "./set-rules";

export type Confidence = "alta" | "media";

export interface Recognition {
  card: CatalogCard;
  setSlug: string;
  parallel: string | null;
  confidence: Confidence;
}

export interface RecognizeResult {
  match: Recognition | null;
  /** Por qué no se reconoció (útil para depurar). */
  reason?: string;
}

/** Minúsculas, sin acentos; "/", "-", "." y demás signos pasan a espacios. */
export function flat(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ø/gi, "o")
    .replace(/ł/gi, "l")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const has = (hay: string, phrase: string) => ` ${hay} `.includes(` ${phrase} `);

// ---------------------------------------------------------------------------
// Temporada

interface SeasonInfo {
  pairs: string[]; // "2025-26"
  years: string[]; // "2026"
}

function readSeasons(title: string): SeasonInfo {
  const t = title.toLowerCase();
  const pairs = new Set<string>();
  const usedYears = new Set<string>();
  for (const m of t.matchAll(/(?<!\d)(20)?(\d{2})\s*[-/–]\s*(20)?(\d{2})(?!\d)/g)) {
    const a = Number(m[2]);
    const b = Number(m[4]);
    if (b === (a + 1) % 100 && a >= 10) {
      pairs.add(`20${m[2]}-${m[4]}`);
      usedYears.add(`20${m[2]}`);
    }
  }
  const years = new Set<string>();
  for (const m of t.matchAll(/(?<!\d)(20[12]\d)(?!\d)/g)) if (!usedYears.has(m[1])) years.add(m[1]);
  return { pairs: [...pairs], years: [...years] };
}

/** true = la temporada del título encaja; false = es otra; null = el título no dice temporada. */
function seasonFits(rule: SetRule, s: SeasonInfo): boolean | null {
  if (s.pairs.length === 0 && s.years.length === 0) return null;
  for (const season of rule.seasons) {
    if (/^\d{4}$/.test(season)) {
      if (s.years.includes(season)) return true;
    } else {
      if (s.pairs.includes(season)) return true;
      // Un año suelto cuenta como el año de inicio ("Topps Chrome UCC 2025" = 2025-26)
      if (s.pairs.length === 0 && s.years.includes(season.slice(0, 4))) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Índice por colección

interface PlayerEntry {
  card: CatalogCard;
  tokens: string[];
  surname: string;
  subsetTokens: string[];
}

const PARTICLES = new Set(["de", "da", "do", "di", "del", "van", "von", "der", "den", "la", "le", "el", "jr", "junior"]);

const index = new Map<string, { players: PlayerEntry[]; surnameCount: Map<string, number> }>();
for (const c of CARDS) {
  let entry = index.get(c.set_slug);
  if (!entry) {
    entry = { players: [], surnameCount: new Map() };
    index.set(c.set_slug, entry);
  }
  const tokens = flat(c.player).split(" ").filter(Boolean);
  const meaningful = tokens.filter((t) => !PARTICLES.has(t));
  const surname = meaningful[meaningful.length - 1] ?? tokens[tokens.length - 1];
  entry.players.push({ card: c, tokens, surname, subsetTokens: flat(c.subset).split(" ").filter(Boolean) });
}
for (const entry of index.values()) {
  const seenPlayers = new Map<string, Set<string>>();
  for (const p of entry.players) {
    const set = seenPlayers.get(p.surname) ?? new Set();
    set.add(flat(p.card.player));
    seenPlayers.set(p.surname, set);
  }
  for (const [s, players] of seenPlayers) entry.surnameCount.set(s, players.size);
}

/** Números de carta que existen en cada colección (para no fiarse de "números" que no lo son). */
const numbersBySet = new Map<string, Set<string>>();
for (const c of CARDS) {
  const set = numbersBySet.get(c.set_slug) ?? new Set<string>();
  set.add(c.number.toUpperCase());
  numbersBySet.set(c.set_slug, set);
}

/** ¿Las palabras de la subserie aparecen en el título? (sin contar "base" y aceptando singular/plural) */
function subsetInTitle(subsetTokens: string[], words: Set<string>): boolean {
  const toks = subsetTokens.filter((t) => t !== "base");
  if (!toks.length) return false;
  return toks.every((t) => words.has(t) || words.has(t.replace(/s$/, "")) || words.has(`${t}s`));
}

const PLAIN_AUTO = /^(base |chrome )?autographs?$/i;

const parallelsBySet = new Map(SETS.map((s) => [s.slug, s.parallels]));

// ---------------------------------------------------------------------------
// Número de carta y numeración (/99)

function readNumbers(title: string): string[] {
  const t = title.toLowerCase();
  const out = new Set<string>();
  for (const m of t.matchAll(/#\s*([a-z]{0,4}-?\d{1,3}[a-z]?)/g)) out.add(m[1]);
  for (const m of t.matchAll(/\bn[ºo°]\.?\s*(\d{1,3})\b/g)) out.add(m[1]);
  for (const m of t.matchAll(/(?<![a-z0-9])([a-z]{1,4}-\d{1,3})(?![a-z0-9])/g)) out.add(m[1]);
  // Códigos de autógrafo con letras: "A-LY", "MBS-EH", "PFA-LY" (solo cuentan si existen en la colección)
  for (const m of t.matchAll(/(?<![a-z0-9])([a-z]{1,4}-[a-z]{1,4}\d?)(?![a-z0-9])/g)) out.add(m[1]);
  return [...out].map((n) => n.toUpperCase().replace(/^0+(?=\d)/, ""));
}

function readPrintRun(title: string): number | null {
  for (const m of title.matchAll(/(\d{0,4})\s?\/\s?(\d{1,4})(?!\d)/g)) {
    const a = m[1] ? Number(m[1]) : null;
    const b = Number(m[2]);
    // "25/26" o "2025/2026" son temporadas, no numeración
    if (a !== null && (b === a + 1 || b === (a + 1) % 100)) continue;
    if (a !== null && a > b) continue;
    if (b >= 1 && b <= 999) return b;
  }
  return null;
}

const COLORS = [
  "gold", "green", "blue", "red", "orange", "purple", "pink", "black", "white", "aqua", "teal",
  "yellow", "silver", "bronze", "magenta", "sapphire", "emerald", "ruby",
];

/**
 * Variante en forma canónica, para que eBay y Vinted den la misma etiqueta:
 *   - con numeración: "<color> /<n>"  ("Green Refractor 12/99" → "Green /99"; "/399" si no hay color)
 *   - sin numeración: el nombre de variante conocido más largo ("Refractor", "Holo Foil"...)
 *   - nada: null (carta normal)
 */
function detectParallel(setSlug: string, t: string, rawTitle: string, card: CatalogCard): string | null {
  const subset = flat(card.subset);
  const run = readPrintRun(rawTitle);
  if (run) {
    const color = COLORS.find((c) => has(t, c) && !subset.includes(c));
    return color ? `${color[0].toUpperCase()}${color.slice(1)} /${run}` : `/${run}`;
  }
  const named = (parallelsBySet.get(setSlug) ?? [])
    .map((label) => ({ label: label.replace(/\s*\/\s*\d+$/, ""), name: flat(label.replace(/\/\s*\d+/, "")) }))
    .filter((p) => p.name && !subset.includes(p.name) && has(t, p.name))
    .sort((a, b) => b.name.length - a.name.length);
  return named[0]?.label ?? null;
}

// ---------------------------------------------------------------------------

const AUTO_WORDS = [
  "auto", "autos", "autograph", "autographed", "autographs", "autografo", "autografos", "autografiada",
  "autografato", "firma", "firmada", "signed", "signature",
];
const INSERT_WORDS = ["insert", "inserto", "insertos", "case hit", "ssp", "sp", "short print"];
const MEMORABILIA = ["relic", "patch", "parche", "memorabilia", "jersey", "camiseta", "shirt"];

export function recognize(title: string, hint?: string): RecognizeResult {
  const why = excludedReason(title);
  if (why) return { match: null, reason: why };

  const t = flat(title);
  // Parches y relics solo cuentan si la carta del catálogo es de ese tipo (gama alta)
  const isMemorabilia = MEMORABILIA.some((w) => has(t, w));
  const isAuto = AUTO_WORDS.some((w) => has(t, w));

  const seasons = readSeasons(title);
  const numbers = readNumbers(title);
  const words = new Set(t.split(" "));

  // 1) Colecciones posibles
  const sets: { rule: SetRule; confidence: Confidence }[] = [];
  for (const rule of SET_RULES) {
    if (!rule.any.some((p) => has(t, p))) continue;
    if (rule.all && !rule.all.every((p) => has(t, p))) continue;
    if (rule.forbid.some((p) => has(t, flat(p)))) continue;
    const fits = seasonFits(rule, seasons);
    if (fits === false) continue;
    if (fits === true) sets.push({ rule, confidence: "alta" });
    else if (hint === rule.slug) sets.push({ rule, confidence: "media" });
  }
  if (sets.length === 0) return { match: null, reason: "colección no reconocida" };

  // 2) Cartas posibles en esas colecciones
  type Cand = { p: PlayerEntry; score: number; confidence: Confidence; slug: string };
  const cands: Cand[] = [];
  for (const { rule, confidence } of sets) {
    const entry = index.get(rule.slug);
    if (!entry) continue;
    const setNumbers = numbersBySet.get(rule.slug) ?? new Set<string>();
    const setNums = numbers.filter((n) => setNumbers.has(n));
    for (const p of entry.players) {
      let score = 0;
      if (p.tokens.every((tok) => words.has(tok))) score = 3;
      else if (p.surname.length >= 4 && words.has(p.surname) && entry.surnameCount.get(p.surname) === 1) score = 2;
      if (!score) continue;
      const numberOk = setNums.includes(p.card.number.toUpperCase());
      // Si el título trae un número de carta (de esta colección) y no es el de esta carta, es otra carta
      if (setNums.length && !numberOk) continue;
      // Solo el apellido no basta (hay "Thiago Silva" e "Igor Thiago"): hace falta también el número
      if (score === 2 && !numberOk) continue;
      if (numberOk) score += 3;
      // Serie base: "Base" a secas gana por defecto; las variantes y niveles de la base
      // ("Base Rare", "Base Rookie Image Variations"...) solo si el título lo dice
      const isBaseFamily = /^base/i.test(p.card.subset);
      if (p.card.subset !== "Base" && subsetInTitle(p.subsetTokens, words)) score += 2;
      else if (p.card.subset === "Base") score += 1;
      else if (isBaseFamily) score += 0;
      // Si el anuncio dice "auto"/"firma", la carta firmada pasa por delante de la normal
      const subsetIsAuto = /aut|firma|signature/i.test(p.card.subset);
      if (isAuto && subsetIsAuto) score += 3;
      // Firma sin más pistas: la serie de autógrafos normal antes que las especiales
      if (isAuto && PLAIN_AUTO.test(p.card.subset)) score += 1;
      if (isMemorabilia && /relic|patch|memorabilia|match ball|swatch|jersey/i.test(p.card.subset)) score += 3;
      cands.push({ p, score, confidence, slug: rule.slug });
    }
  }
  if (cands.length === 0) return { match: null, reason: "jugador no encontrado en la colección" };

  cands.sort((a, b) => b.score - a.score);
  const best = cands[0];
  const tied = cands.filter((c) => c.score === best.score && c.p.card.id !== best.p.card.id);
  if (tied.length) return { match: null, reason: `dudoso entre ${tied.length + 1} cartas` };

  const card = best.p.card;
  // Dice que es un insert / short print pero hemos caído en la serie base: será un insert que no está en el catálogo
  if (/^base/i.test(card.subset) && INSERT_WORDS.some((w) => has(t, w))) {
    return { match: null, reason: "insert que no está en el catálogo" };
  }
  if (isAuto && !/aut|firma|signature/i.test(card.subset)) return { match: null, reason: "autógrafo (no está en el catálogo)" };
  if (isMemorabilia && !/relic|patch|memorabilia|match ball|swatch|jersey/i.test(card.subset)) {
    return { match: null, reason: "memorabilia (no está en el catálogo)" };
  }

  return {
    match: {
      card,
      setSlug: best.slug,
      parallel: detectParallel(best.slug, t, title, card),
      confidence: best.confidence,
    },
  };
}
