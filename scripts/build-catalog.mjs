// Convierte los listados de data/catalog/*.txt en lib/catalog-data.json (lo que importa la web).
// Se ejecuta solo antes de `npm run build` y `npm run dev`. Para añadir una colección:
//   1. crea data/catalog/<slug>.txt   (líneas "número|jugador|equipo|RC", secciones "## Nombre")
//   2. añade su ficha en data/sets.json con el mismo slug
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sets = JSON.parse(readFileSync(join(root, "data/sets.json"), "utf8"));
const setBySlug = new Map(sets.map((s) => [s.slug, s]));

// Nombres de equipo unificados (las fuentes escriben el mismo club de varias formas)
const TEAM_ALIASES = {
  Arsenal: "Arsenal FC",
  Chelsea: "Chelsea FC",
  Liverpool: "Liverpool FC",
  Burnley: "Burnley FC",
  "Real Madrid CF": "Real Madrid C.F.",
  "Rangers FC": "Rangers F.C.",
  "Real Betis": "Real Betis Balompié",
  "UD Levante": "Levante UD",
  "S.L. Benfica": "SL Benfica",
  "Atletico de Madrid": "Atlético de Madrid",
  "AS Monaco FC": "AS Monaco",
  "Real Sociedad": "Real Sociedad de Fútbol",
  "West Ham United FC": "West Ham United",
  "Manchester City FC": "Manchester City",
  "Sporting Clube De Portugal": "Sporting Clube de Portugal",
  "Galatasaray SK": "Galatasaray",
  "F.C. Copenhagen": "FC Copenhagen",
  "FC Shakhtar Donetsk": "Shakhtar Donetsk",
};

// Sufijos de subserie que algunas fuentes pegan al nombre del jugador (Topps Premier League)
const NAME_SUFFIX = { GN: "Generation Now", FF: "Full Force", BB: "Breakthrough Baller", TK: "Tekkers" };

export const normalize = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ø/gi, "o")
    .replace(/ł/gi, "l")
    .toLowerCase()
    .replace(/[^a-z0-9/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const errors = [];
const cards = [];
const counts = {};

for (const file of readdirSync(join(root, "data/catalog")).filter((f) => f.endsWith(".txt")).sort()) {
  const slug = file.replace(/\.txt$/, "");
  const set = setBySlug.get(slug);
  if (!set) {
    errors.push(`${file}: falta su ficha en data/sets.json`);
    continue;
  }
  let subset = "Base";
  const seen = new Set();
  counts[slug] = 0;

  readFileSync(join(root, "data/catalog", file), "utf8")
    .split("\n")
    .forEach((raw, i) => {
      const line = raw.trim();
      if (!line) return;
      if (line.startsWith("##")) {
        subset = line.replace(/^#+/, "").trim();
        return;
      }
      const [number, rawPlayer, rawTeam = "", flag = ""] = line.split("|").map((x) => x.trim());
      if (!number || !rawPlayer) {
        errors.push(`${file}:${i + 1} línea incompleta: "${line}"`);
        return;
      }
      let player = rawPlayer;
      let cardSubset = subset;
      const suffix = player.match(/ (GN|FF|BB|TK)$/);
      if (suffix && subset === "Base") {
        player = player.slice(0, -3);
        cardSubset = NAME_SUFFIX[suffix[1]];
      }
      const team = TEAM_ALIASES[rawTeam] ?? rawTeam;

      let id = `${slug}:${number}`;
      if (seen.has(id)) id = `${slug}:${normalize(cardSubset).replace(/ /g, "-")}:${number}`;
      if (seen.has(id)) {
        errors.push(`${file}:${i + 1} número repetido ${number} en "${cardSubset}"`);
        return;
      }
      seen.add(id);

      cards.push({
        id,
        set_slug: slug,
        number,
        player,
        team: team || null,
        subset: cardSubset,
        rookie: flag.toUpperCase() === "RC",
        search_text: normalize(`${player} ${team} ${set.name} ${cardSubset} ${number}`),
      });
      counts[slug]++;
    });
}

for (const s of sets) {
  if (!counts[s.slug]) errors.push(`data/sets.json: "${s.slug}" no tiene cartas`);
}

if (errors.length) {
  console.error("✗ Catálogo con errores:\n  " + errors.join("\n  "));
  process.exit(1);
}

const out = {
  generated: new Date().toISOString(),
  sets: sets.map(({ keywords, ...s }) => ({
    ...s,
    aliases: keywords,
    card_count: counts[s.slug],
  })),
  cards,
};
writeFileSync(join(root, "lib/catalog-data.json"), JSON.stringify(out));
console.log(`✓ Catálogo: ${cards.length} cartas en ${sets.length} colecciones`);
