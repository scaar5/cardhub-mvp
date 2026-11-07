// Convierte un checklist descargado por checklist-fetch (rama checklists-raw) en
// data/catalog/<slug>.txt + su ficha en data/sets.json, y valida con build-catalog.
// Solo imprime totales. Uso:
//   node scripts/dev/add-collection.mjs <raw.txt> <slug> "<Nombre>" "<Competición>" "kw1;kw2" [--rookies] [--keep-variations]
//     --rookies          solo cartas RC (p. ej. Topps Chrome UCC 2020-21)
//     --keep-variations  conserva las secciones "... Variations" (por defecto se saltan: repiten los números de la base)
// Para sacar el checklist de la rama:  git show origin/checklists-raw:<slug>.txt > .cache/<slug>.raw.txt
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const [rawFile, slug, name, competition, kw = ""] = args.filter((a) => !a.startsWith("--"));
if (!rawFile || !slug || !name || !competition) {
  console.log('uso: add-collection.mjs <raw.txt> <slug> "<Nombre>" "<Competición>" "kw1;kw2" [--rookies] [--keep-variations]');
  process.exit(1);
}
const season = (slug.match(/(\d{4}-\d{2}|\d{4})$/) || [])[1];
const lines = readFileSync(rawFile, "utf8").split("\n").map((l) => l.trim());

// Secciones que no son listas de cartas
const SKIP_HEAD = /guide|rundown|release date|brands|details|configuration|box break|buy |odds \/ npn|^\d{4}(-\d{2})? topps .*(autograph|insert|relic|memorabilia) checklist$/i;
const CARD = /^([A-Z]{0,6}-?[A-Z0-9]*\d[A-Z0-9]*|[A-Z]{1,6}-[A-Z0-9]{1,6})\s+(.+?)\s+-\s+(.+?)(\s+RC)?(?:\s+-\s+.*)?$/;
const cleanPar = (p) => {
  let x = p.replace(/#\//g, "/").replace(/\s*\([^)]*\)\s*$/, "").replace(/\s*-\s*\/?\d+ or less$/i, "").replace(/\s+1\/1$/, " /1").replace(/\s+/g, " ").trim();
  x = x.replace(/^SuperFractor/i, "Superfractor");
  if (!/^refractor$/i.test(x)) x = x.replace(/ Refractor(?= \/|$)/i, "");
  return x;
};

const sections = []; // {name, cards:[]}
let cur = null, inPar = false, baseParallels = null, started = false, firstBase = null;
for (const l of lines) {
  if (l.startsWith("## ")) {
    inPar = false;
    const h = l.slice(3).replace(/\s+Checklist$/i, "").replace(/\s+Set$/i, "").trim(); // "Chrome Autographs Set Checklist" (cardboardconnection)
    if (/team set checklist|team set list|team list|^## team checklist/i.test(l) && !/beam team/i.test(l) && started) { cur = null; break; }
    if (SKIP_HEAD.test(l) || !/checklist$/i.test(l) || (/variation/i.test(h) && !flags.has("--keep-variations"))) { cur = null; continue; }
    let sec = h.replace(/^(Base) (Common|Set|Cards|Sapphire|Chrome|Cards Set|\/ Inserts)$/i, "Base");
    if (/^\d{4}/.test(sec)) { cur = null; continue; } // título general de la página
    cur = { name: sec, cards: [], seen: new Set() };
    if (!firstBase && /^base/i.test(sec)) firstBase = cur;
    sections.push(cur);
    started = true;
    continue;
  }
  if (!cur) continue;
  // "Parallels: a; b." (checklistinsider) o "REFRACTOR PARALLELS: a #/99, b." / "PARALLEL CARDS: ..." (cardboardconnection)
  const inline = l.match(/^(?:[A-Za-z ]*parallels?(?: cards)?|versions):\s*(.+)$/i);
  if (inline) {
    if (!baseParallels && cur === firstBase) baseParallels = inline[1].replace(/\.$/, "").split(/;\s*|,\s*(?![^(]*\))/).map(cleanPar).filter(Boolean);
    continue;
  }
  if (/^(Parallels|Versions):?$/i.test(l)) { inPar = true; if (!baseParallels && cur === firstBase) baseParallels = []; continue; }
  const m = l.replace(/^#(\S+)\s+-\s+/, "$1 ").match(CARD);
  if (m && !/^\d+ cards/i.test(l)) {
    inPar = false;
    const [, num, player, team, rc] = m;
    if (cur.seen.has(num)) continue;
    cur.seen.add(num);
    cur.cards.push(`${num}|${player.replace(/\s*\|\s*/g, " ")}|${team.replace(/\s*\|.*$/, "")}|${rc ? "RC" : ""}`);
    continue;
  }
  // Secciones sin número (p. ej. firmas de Inception): "Jugador - Equipo" -> número sintético "U<sección>-<n>"
  const u = l.match(/^([^\d|:;]{3,45}?) - ([^\d|:;]{3,50}?)( RC)?$/);
  if (u && !/ebay|cards|odds|=|subset key/i.test(l) && !/^(parallels|versions)/i.test(l)) {
    inPar = false;
    const num = `U${sections.length}-${cur.cards.length + 1}`;
    cur.seen.add(num);
    cur.cards.push(`${num}|${u[1]}|${u[2]}|${u[3] ? "RC" : ""}`);
    continue;
  }
  if (inPar && baseParallels && cur === firstBase && cur.cards.length === 0 && /[A-Za-z]/.test(l) && l.length < 60) baseParallels.push(cleanPar(l));
}

let kept = sections.filter((s) => s.cards.length);
if (flags.has("--rookies")) kept = kept.map((s) => ({ ...s, cards: s.cards.filter((c) => c.endsWith("|RC")) })).filter((s) => s.cards.length);
// Mismo nombre de sección dos veces -> se unen
const merged = new Map();
for (const s of kept) {
  const m = merged.get(s.name) ?? { name: s.name, cards: [], seen: new Set() };
  for (const c of s.cards) { const n = c.split("|")[0]; if (!m.seen.has(n)) { m.seen.add(n); m.cards.push(c); } }
  merged.set(s.name, m);
}
const out = [...merged.values()].map((s) => `## ${s.name}\n${s.cards.join("\n")}`).join("\n") + "\n";
writeFileSync(`data/catalog/${slug}.txt`, out);

const parallels = [...new Set(baseParallels ?? [])];
const sets = JSON.parse(readFileSync("data/sets.json", "utf8"));
const entry = {
  slug, name, brand: name.split(" ")[0], season, competition,
  keywords: kw.split(";").map((k) => k.trim()).filter(Boolean),
  parallels,
};
const i = sets.findIndex((s) => s.slug === slug);
if (i >= 0) sets[i] = entry; else sets.push(entry);
writeFileSync("data/sets.json", JSON.stringify(sets, null, 2) + "\n");

const total = [...merged.values()].reduce((n, s) => n + s.cards.length, 0);
const rc = out.split("\n").filter((l) => l.endsWith("|RC")).length;
const base = merged.get("Base")?.cards.length ?? 0;
console.log(`${slug}: ${total} cartas (base ${base}, RC ${rc}) en ${merged.size} secciones · ${parallels.length} paralelas`);
try {
  console.log(execSync("node scripts/build-catalog.mjs 2>&1", { encoding: "utf8" }).trim());
} catch (e) {
  console.log(String(e.stdout).split("\n").slice(0, 8).join("\n"));
  process.exit(1);
}
