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

for (const { q, set } of cfg.searches) {
  if (stop) break;
  const seen = new Set();
  const st = { q, pages: 0, items: 0, end: "max" };
  for (let page = 1; page <= MAX_PAGES; page++) {
    if (Date.now() - started > BUDGET_MIN * 60000) { st.end = "time"; stop = true; break; }
    const url = `https://www.vinted.es/catalog?order=newest_first&search_text=${encodeURIComponent(q)}${page > 1 ? `&page=${page}` : ""}`;
    let res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "es-ES,es;q=0.9" } });
    requests++;
    if (res.status === 403 || res.status === 429) {
      blocks++;
      console.log(`${q} p${page}: ${res.status} → espero 15 min`);
      await sleep(15 * 60000);
      res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "es-ES,es;q=0.9" } });
      requests++;
      if (!res.ok) { console.log(`Sigue ${res.status}: paro el censo.`); st.end = `blocked ${res.status}`; stop = true; break; }
    }
    if (!res.ok) { st.end = `status ${res.status}`; break; }
    const html = await res.text();
    let n = 0, fresh = 0;
    for (const m of html.matchAll(/data-testid="product-item-id-(\d+)--overlay-link"[^>]*?title="([^"]*)"/g)) {
      n++;
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      fresh++;
      if (!seenAll.has(m[1])) { seenAll.add(m[1]); items.push({ id: m[1], attr: decode(m[2]), q, set, page }); }
    }
    st.pages = page;
    st.items = seen.size;
    if (!n) { st.end = "empty"; break; }
    if (!fresh) { st.end = "repeat"; break; } // Vinted devuelve otra vez la última página
    await sleep(5000 + Math.random() * 2000);
  }
  perSearch.push(st);
  console.log(`SEARCH ${JSON.stringify(st)} total_unicos=${seenAll.size}`);
  save();
}
save();
console.log(`CENSUS ${JSON.stringify({ requests, blocks, unique: seenAll.size, minutes: Math.round((Date.now() - started) / 60000) })}`);
