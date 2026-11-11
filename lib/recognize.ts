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
function seasonFits(rule: SetRule, s: SeasonInfo): boolean | "end" | null {
  if (s.pairs.length === 0 && s.years.length === 0) return null;
  let end = false;
  for (const season of rule.seasons) {
    if (/^\d{4}$/.test(season)) {
      if (s.years.includes(season)) return true;
    } else {
      if (s.pairs.includes(season)) return true;
      // Un año suelto cuenta como el año de inicio ("Topps Chrome UCC 2025" = 2025-26)
      if (s.pairs.length === 0 && s.years.includes(season.slice(0, 4))) return true;
      // …o el año de salida ("Topps Merlin UEFA 2022" = 2021-22): solo si lo anterior no encuentra la carta
      if (s.pairs.length === 0 && s.years.includes(`20${season.slice(5, 7)}`)) end = true;
    }
  }
  return end ? "end" : false;
}

// ---------------------------------------------------------------------------
// Índice por colección

interface PlayerEntry {
  card: CatalogCard;
  tokens: string[];
  surname: string;
  subsetTokens: string[];
  teamTokens: string[];
}

// Palabras del nombre del club que no sirven para identificarlo
const TEAM_STOP = new Set(["club", "futbol", "football", "calcio", "sporting", "athletic", "united", "city", "real", "olympique", "borussia", "association", "sport", "clube", "internazionale"]);
const NAME_ALIASES: [string, string][] = [["vinicius", "vini"], ["junior", "jr"], ["kylian", "mbappe"]];
// Apodos habituales en los títulos → palabra del nombre oficial del club
const TEAM_ALIASES: Record<string, string> = { psg: "paris", barca: "barcelona", juve: "juventus", atleti: "atletico", inter: "inter", bayern: "bayern", milan: "milan", spurs: "tottenham", benfica: "benfica" };

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
  const teamTokens = flat(c.team ?? "").split(" ").filter((w) => w.length >= 4 && !TEAM_STOP.has(w));
  entry.players.push({ card: c, tokens, surname, subsetTokens: flat(c.subset).split(" ").filter(Boolean), teamTokens });
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
    // El color que forma parte del nombre de la colección ("Sapphire") no es paralela
    const setName = flat(SETS.find((x) => x.slug === setSlug)?.name ?? "");
    const color = COLORS.find((c) => has(t, c) && !subset.includes(c) && !setName.includes(c));
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
  "autografato", "autographe", "autogramm", "assinada", "assinado", "autografada", "firma", "firmada", "firmado", "autografiado", "autografiada", "signed", "signature",
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
  // Formas habituales de escribir un mismo nombre ("Vinicius Junior" = "Vini Jr.")
  for (const [a, b] of NAME_ALIASES) if (words.has(a)) words.add(b);
  const teamWords = new Set([...words].map((w) => TEAM_ALIASES[w] ?? w));

  // 1) Colecciones posibles
  // weak = el título dice la marca y la temporada ("Topps Chrome 2025/26") pero no la competición
  // (UEFA / Premier League): vale solo si además coincide el número de carta o el club.
  // tier 2 = temporada leída por el año de salida: solo se usa si el tier 1 no encuentra la carta.
  type SetCand = { rule: SetRule; confidence: Confidence; weak: boolean; tier: 1 | 2 };
  const allSets: SetCand[] = [];
  // Sin temporada en el título: todas las temporadas de ese producto (para la regla del rookie, abajo)
  const freeSets: SetCand[] = [];
  for (const rule of SET_RULES) {
    const anyOk = rule.any.some((p) => has(t, p));
    if (rule.all && !rule.all.every((p) => has(t, p))) continue;
    if (!anyOk && !rule.all) continue;
    if (rule.forbid.some((p) => has(t, flat(p)))) continue;
    const fits = seasonFits(rule, seasons);
    if (fits === false) continue;
    if (fits === true || fits === "end") allSets.push({ rule, confidence: "alta", weak: !anyOk, tier: fits === true ? 1 : 2 });
    else {
      if (hint === rule.slug && anyOk) allSets.push({ rule, confidence: "media", weak: false, tier: 1 });
      // También solo con la marca ("Topps Finest … RC"): si sale rookie en UCC y en Premier, empate → nada
      freeSets.push({ rule, confidence: "alta", weak: !anyOk, tier: 1 });
    }
  }
  // Rookie sin temporada ("Prestianni RC Purple /299 – Topps Chrome UEFA"): un jugador solo tiene
  // rookie card en una temporada de cada producto, así que si en todas las temporadas sale una sola
  // carta rookie suya, es esa (alta). Si sale en varias, se queda como estaba.
  const rookieNoSeason = (): RecognizeResult | null => {
    if (!freeSets.length || !/\b(rc|rookie|rookies|rookie card)\b/.test(t)) return null;
    // Solo con la marca (sin UEFA / Premier League): no vale si esa marca tiene otra colección esa
    // temporada (p. ej. Chrome UCC y Chrome Premier League 2025-26), por si al catálogo le falta la otra.
    const usable = freeSets.filter((x) => {
      if (!x.weak) return true;
      const brand = x.rule.all?.[0];
      return !SET_RULES.some((r) => r !== x.rule && r.all?.[0] === brand && r.seasons.some((se) => x.rule.seasons.includes(se)));
    });
    // Solo cartas rookie; pickCard trata weak como "exige número o club": aquí basta con que la rookie sea única
    const res = pickCard(usable.map((x) => ({ ...x, weak: false })), true);
    if (!res?.match || !res.match.card.rookie) return null;
    // Dentro de esa colección, sin filtrar, tiene que salir la misma carta (si el título nombra un
    // insert del jugador, "Top of the World"…, no es la rookie de la serie base)
    const same = pickCard(usable.filter((x) => x.rule.slug === res.match!.setSlug).map((x) => ({ ...x, weak: false })));
    return same?.match && same.match.card.id === res.match.card.id ? res : null;
  };
  if (allSets.length === 0) return rookieNoSeason() ?? { match: null, reason: "colección no reconocida" };
  // Sin competición en el título solo hay duda si esa marca tiene otra colección esa temporada
  // (p. ej. Chrome UCC y Chrome Premier League 2025-26); si no, "Topps Finest 2023/24" basta.
  for (const x of allSets) {
    if (!x.weak) continue;
    const brand = x.rule.all?.[0];
    const siblings = SET_RULES.filter((r) => r !== x.rule && r.all?.[0] === brand && r.seasons.some((se) => x.rule.seasons.includes(se)));
    if (siblings.length === 0) x.weak = false;
  }
  const tier1 = allSets.filter((x) => x.tier === 1);
  const r1 = tier1.length ? pickCard(tier1) : null;
  const r = r1 && r1.match ? r1 : (pickCard(allSets.filter((x) => x.tier === 2)) ?? r1)!;
  if (r.match?.confidence !== "alta" && !seasons.pairs.length && !seasons.years.length) return rookieNoSeason() ?? r;
  return r;

  function pickCard(sets: SetCand[], onlyRookie = false): RecognizeResult | null {
  if (sets.length === 0) return null;

  // 2) Cartas posibles en esas colecciones
  type Cand = { p: PlayerEntry; score: number; confidence: Confidence; slug: string };
  const cands: Cand[] = [];
  for (const { rule, confidence, weak } of sets) {
    const entry = index.get(rule.slug);
    if (!entry) continue;
    const setNumbers = numbersBySet.get(rule.slug) ?? new Set<string>();
    const setNums = numbers.filter((n) => setNumbers.has(n));
    for (const p of entry.players) {
      if (onlyRookie && !p.card.rookie) continue;
      let score = 0;
      if (p.tokens.every((tok) => words.has(tok))) score = 3;
      else if (p.surname.length >= 4 && words.has(p.surname) && entry.surnameCount.get(p.surname) === 1) score = 2;
      if (!score) continue;
      const numberOk = setNums.includes(p.card.number.toUpperCase());
      // Si el título trae un número de carta (de esta colección) y no es el de esta carta, es otra carta
      if (setNums.length && !numberOk) continue;
      // Solo el apellido no basta (hay "Thiago Silva" e "Igor Thiago"): hace falta también el número
      const teamOk = p.teamTokens.some((w) => teamWords.has(w));
      // …salvo que coincida el club ("Tchouameni Merlin 2023-24 Real Madrid")
      if (score === 2 && !numberOk && !teamOk) continue;
      if (weak && !numberOk && !teamOk) continue;
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
  // Código de insert con letras ("NL-06", "FS-12", "CL-3") que no es el número de esta carta: es un insert que el
  // catálogo no tiene (voto ❌ del 11-nov: "No Limits NL-06" se reconocía como Yamal #27 base).
  if (/^base/i.test(card.subset)) {
    const known = numbersBySet.get(best.slug) ?? new Set<string>();
    const codes = [...title.matchAll(/(?<![A-Za-z0-9])([A-Za-z]{2,4}-\d{1,3})(?![A-Za-z0-9])/g)].map((m) => m[1].toUpperCase()).filter((c) => !c.startsWith("SUB-")); // "Sub-23" es una categoría de edad
    if (codes.some((c) => c !== card.number.toUpperCase() && !known.has(c))) {
      return { match: null, reason: "insert con código que no está en el catálogo" };
    }
  }
  if (isAuto && !/aut|firma|signature/i.test(card.subset)) return { match: null, reason: "autógrafo (no está en el catálogo)" };
  // Al revés: la carta del catálogo es firmada pero el anuncio no lo dice → seguramente es otra carta (la normal)
  if (!isAuto && /aut|firma|signature/i.test(card.subset)) return { match: null, reason: "carta firmada pero el anuncio no dice auto" };
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
}
