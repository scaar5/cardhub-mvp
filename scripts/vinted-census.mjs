// Censo (a mano): ¿cuántos anuncios hay HOY en vinted.es para cada búsqueda del sniper?
// Recorre cada búsqueda página a página (1, 2, 3…) hasta que una página viene vacía o no trae nada nuevo
// (o hasta MAX_PAGES). No reconoce ni guarda nada en la base: deja los títulos en out/census.json
// (rama "vinted-census") para contarlos sin conexión con scripts/dev/census-count.mts.
// Lo ejecuta .github/workflows/vinted-census.yml.
import { writeFileSync, mkdirSync } from "node:fs";

const APP_URL = (process.env.APP_URL || "https://scaard5-analytics.vercel.app").replace(/\/$/, "");
const SECRET = (process.env.ALERT_SECRET || "").trim();
const MAX_PAGES = Number(process.env.MAX_PAGES || 60);
const BUDGET_MIN = Number(process.env.BUDGET_MIN || 320); // para guardar antes de que GitHub corte el job
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const decode = (s) =>
  s.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

const started = Date.now();
const cfg = await fetch(`${APP_URL}/api/vinted`, { headers: { "x-alert-secret": SECRET } }).then((r) => r.json());
if (!cfg.ok) throw new Error(`No pude leer las búsquedas: ${JSON.stringify(cfg)}`);

const items = [];
const perSearch = [];
const seenAll = new Set();
let requests = 0, blocks = 0, stop = false;

function save() {
  mkdirSync("out", { recursive: true });
  writeFileSync(
    "out/census.json",
    JSON.stringify({ at: new Date().toISOString(), minutes: Math.round((Date.now() - started) / 60000), requests, blocks, perSearch, items }),
  );
}

// Tramos de precio: Vinted corta cada búsqueda en ~11 páginas (~950 anuncios). Si una búsqueda llega al tope,
// se repite por tramos de precio (cada tramo tiene su propio tope); si un tramo también llega, se parte en dos.
const BANDS = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 75, 100, 150, 250, 500, 100000];
const CAP = 850;

async function getPage(url) {
  let res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "es-ES,es;q=0.9" } });
  requests++;
  if (res.status === 403 || res.status === 429) {
    blocks++;
    console.log(`${res.status} → espero 15 min`);
    await sleep(15 * 60000);
    res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "es-ES,es;q=0.9" } });
    requests++;
    if (!res.ok) { console.log(`Sigue ${res.status}: paro el censo.`); stop = true; return null; }
  }
  return res.ok ? res.text() : "";
}

/** Lee todas las páginas de una búsqueda (opcionalmente en un tramo de precio). Devuelve { seen, pages, end }. */
async function crawl(q, set, from, to) {
  const seen = new Set();
  let pages = 0, end = "max", newGlobal = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    if (Date.now() - started > BUDGET_MIN * 60000) { end = "time"; stop = true; break; }
    const price = from == null ? "" : `&price_from=${from}&price_to=${to}&currency=EUR`;
    const html = await getPage(`https://www.vinted.es/catalog?order=newest_first&search_text=${encodeURIComponent(q)}${price}${page > 1 ? `&page=${page}` : ""}`);
    if (html == null) { end = "blocked"; break; }
    let n = 0, fresh = 0;
    for (const m of html.matchAll(/data-testid="product-item-id-(\d+)--overlay-link"[^>]*?title="([^"]*)"/g)) {
      n++;
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      fresh++;
      if (!seenAll.has(m[1])) { seenAll.add(m[1]); newGlobal++; items.push({ id: m[1], attr: decode(m[2]), q, set, page }); }
    }
    pages = page;
    await sleep(5000 + Math.random() * 2000);
    if (!n) { end = "empty"; break; }
    if (!fresh) { end = "repeat"; break; }
    if (n < 80) { end = "last"; break; } // página incompleta = última
  }
  return { seen: seen.size, pages, end, newGlobal };
}

async function crawlBand(q, set, from, to, depth = 0) {
  if (stop) return;
  const r = await crawl(q, set, from, to);
  const st = { q, from, to, ...r };
  perSearch.push(st);
  console.log(`BAND ${JSON.stringify(st)} total_unicos=${seenAll.size}`);
  if (r.seen >= CAP && to - from > 0.5 && depth < 4) {
    const mid = Math.round(((from + Math.min(to, from * 4 + 10)) / 2) * 2) / 2;
    await crawlBand(q, set, from, mid, depth + 1);
    await crawlBand(q, set, mid, to, depth + 1);
  }
}

for (const { q, set } of cfg.searches) {
  if (stop) break;
  const r = await crawl(q, set);
  perSearch.push({ q, ...r });
  console.log(`SEARCH ${JSON.stringify({ q, ...r })} total_unicos=${seenAll.size}`);
  if (r.seen >= CAP) for (let i = 0; i + 1 < BANDS.length && !stop; i++) await crawlBand(q, set, BANDS[i], BANDS[i + 1]);
  console.log(`DONE ${q} total_unicos=${seenAll.size}`);
  save();
}
save();
console.log(`CENSUS ${JSON.stringify({ requests, blocks, unique: seenAll.size, minutes: Math.round((Date.now() - started) / 60000) })}`);
