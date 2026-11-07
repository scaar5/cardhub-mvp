// Cuenta el censo de Vinted (rama `vinted-census`): cuántos anuncios son cartas del catálogo.
// Uso: npm run catalog && npx -y tsx scripts/dev/census-count.mts
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

mkdirSync(".cache", { recursive: true });
execSync("git fetch -q --depth 1 origin +refs/heads/vinted-census:refs/remotes/origin/vinted-census");
const raw = execSync("git show origin/vinted-census:census.json", { maxBuffer: 1 << 29 }).toString();
writeFileSync(".cache/census.json", raw);
const data = JSON.parse(raw);
const { recognize } = await import("../../lib/recognize.ts");

const dec = (s: string) => s.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#39;/g, "'");
let parsed = 0, ok = 0, ok10 = 0;
const cards = new Set<string>(), cards10 = new Set<string>(), base = new Set<string>();
const bySet: Record<string, [number, number]> = {};
for (const it of data.items as { id: string; attr: string; set?: string }[]) {
  const m = dec(it.attr).match(/^(.*?)((?:, [^,:]{2,20}: [^,]*)*), ([\d.,]+) €(?:, [\d.,]+ €)?/);
  if (!m) continue;
  parsed++;
  const price = Number(m[3].replace(/[.,](?=\d{3}\b)/g, "").replace(",", "."));
  const { match } = recognize(m[1].trim(), it.set);
  if (!match || match.confidence !== "alta") continue;
  ok++;
  const key = `${match.card.id}|${match.parallel ?? ""}`;
  cards.add(key);
  base.add(match.card.id);
  const slug = match.card.id.split(":")[0] ?? match.card.id;
  bySet[slug] ??= [0, 0];
  bySet[slug][0]++;
  if (price >= 10) { ok10++; cards10.add(key); bySet[slug][1]++; }
}
const top = Object.entries(bySet).sort((a, b) => b[1][0] - a[1][0]).slice(0, 15);
console.log(JSON.stringify({
  at: data.at, minutes: data.minutes, requests: data.requests, blocks: data.blocks,
  anuncios: data.items.length, legibles: parsed, reconocidos: ok, reconocidos_10: ok10,
  cartas_distintas: base.size, carta_paralela_distintas: cards.size, carta_paralela_10: cards10.size,
}));
const byQ: Record<string, { nuevos: number; tramos: number; topes: number }> = {};
for (const s of data.perSearch as { q: string; seen: number; newGlobal?: number; from?: number }[]) {
  const b = (byQ[s.q] ??= { nuevos: 0, tramos: 0, topes: 0 });
  b.nuevos += s.newGlobal ?? 0;
  if (s.from != null) { b.tramos++; if (s.seen >= 850) b.topes++; }
}
console.log("BUSQUEDAS", JSON.stringify(byQ));
console.log("POR_COLECCION", JSON.stringify(top));
