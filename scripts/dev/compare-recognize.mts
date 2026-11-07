// Mide el reconocedor sobre los anuncios reales de la rama `vinted-probe` (probe.json).
// Solo imprime totales (ahorra tokens). Uso:
//   npm run catalog && npx -y tsx scripts/dev/compare-recognize.mts snap antes
//   ...cambios en catálogo / reconocedor...
//   npm run catalog && npx -y tsx scripts/dev/compare-recognize.mts snap despues
//   npx -y tsx scripts/dev/compare-recognize.mts diff antes despues [prefijo-de-slug]
// Las fotos se guardan en .cache/recognize-<nombre>.json (no se sube).
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const CACHE = ".cache";
mkdirSync(CACHE, { recursive: true });
const PROBE = `${CACHE}/probe.json`;

type Row = { card: string; parallel: string | null; price: number; title: string };
type Snap = Record<string, Row | null>;

function loadProbe(): { id: string; title: string; price: number; set?: string }[] {
  if (!existsSync(PROBE)) {
    execSync("git fetch -q --depth 1 origin +refs/heads/vinted-probe:refs/remotes/origin/vinted-probe");
    writeFileSync(PROBE, execSync("git show origin/vinted-probe:probe.json", { maxBuffer: 1 << 28 }));
  }
  const data = JSON.parse(readFileSync(PROBE, "utf8"));
  const items: { id: string; attr: string; set?: string }[] = data.items ?? data;
  const seen = new Map<string, { id: string; title: string; price: number; set?: string }>();
  const dec = (s: string) => s.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#39;/g, "'");
  for (const it of items) {
    if (seen.has(it.id)) continue;
    // Etiquetas en cualquier idioma: "título, Marca: X, Estado: Y, 12,00 €, 13,30 €"
    const m = dec(it.attr).match(/^(.*?)((?:, [^,:]{2,20}: [^,]*)*), ([\d.,]+) €(?:, [\d.,]+ €)?/);
    if (!m) continue;
    const price = Number(m[3].replace(/[.,](?=\d{3}\b)/g, "").replace(",", "."));
    seen.set(it.id, { id: it.id, title: m[1].trim(), price, set: it.set });
  }
  return [...seen.values()];
}

const [mode, a, b, prefix = ""] = process.argv.slice(2);

if (mode === "snap") {
  const { recognize } = await import("../../lib/recognize.ts");
  const out: Snap = {};
  let ok = 0;
  const rows = loadProbe();
  for (const r of rows) {
    const { match } = recognize(r.title, r.set);
    const hit = match && match.confidence === "alta";
    out[r.id] = hit ? { card: match.card.id, parallel: match.parallel, price: r.price, title: r.title } : null;
    if (hit) ok++;
  }
  writeFileSync(`${CACHE}/recognize-${a}.json`, JSON.stringify(out));
  console.log(`${a}: ${rows.length} anuncios únicos, ${ok} reconocidos (alta)`);
} else if (mode === "diff") {
  const A: Snap = JSON.parse(readFileSync(`${CACHE}/recognize-${a}.json`, "utf8"));
  const B: Snap = JSON.parse(readFileSync(`${CACHE}/recognize-${b}.json`, "utf8"));
  let ra = 0, rb = 0, lost = 0, changed = 0;
  const gained: Record<string, [number, number]> = {}; // slug -> [nuevos, nuevos >=10 €]
  const lostEx: string[] = [], changedEx: string[] = [];
  for (const id of Object.keys(B)) {
    const x = A[id], y = B[id];
    if (x) ra++;
    if (y) rb++;
    if (x && !y) { lost++; if (lostEx.length < 8) lostEx.push(`${x.card} | ${x.title}`); }
    if (x && y && (x.card !== y.card || x.parallel !== y.parallel)) {
      changed++;
      if (changedEx.length < 12) changedEx.push(`${x.card}${x.parallel ? ` [${x.parallel}]` : ""} -> ${y.card}${y.parallel ? ` [${y.parallel}]` : ""} | ${y.title}`);
    }
    if (!x && y) {
      const slug = y.card.split(":")[0];
      gained[slug] ??= [0, 0];
      gained[slug][0]++;
      if (y.price >= 10) gained[slug][1]++;
    }
  }
  console.log(`reconocidos ${a}=${ra} ${b}=${rb} (+${rb - ra}) · perdidos ${lost} · cambiados ${changed}`);
  for (const [s, [n, n10]] of Object.entries(gained).sort()) if (s.startsWith(prefix)) console.log(`  + ${s}: ${n} (≥10 €: ${n10})`);
  if (lostEx.length) console.log("PERDIDOS:\n  " + lostEx.join("\n  "));
  if (changedEx.length) console.log("CAMBIADOS:\n  " + changedEx.join("\n  "));
} else {
  console.log("uso: snap <nombre> | diff <antes> <despues> [prefijo]");
}
