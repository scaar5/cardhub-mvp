// Diagnóstico (a mano, una vez): ¿cuántos anuncios más habría leyendo más páginas o más países de Vinted?
// Para cada búsqueda del sniper lee vinted.es páginas 1–5 y vinted.fr / .it / .de página 1.
// No reconoce ni guarda nada en la base: deja los títulos en out/probe.json (rama "vinted-probe")
// para analizarlos sin conexión. Lo ejecuta .github/workflows/vinted-probe.yml.
import { writeFileSync, mkdirSync } from "node:fs";

const APP_URL = (process.env.APP_URL || "https://scaard5-analytics.vercel.app").replace(/\/$/, "");
const SECRET = (process.env.ALERT_SECRET || "").trim();
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SOURCES = [
  ...[1, 2, 3, 4, 5].map((page) => ({ src: `es-p${page}`, host: "www.vinted.es", lang: "es-ES,es;q=0.9", page })),
  { src: "fr-p1", host: "www.vinted.fr", lang: "fr-FR,fr;q=0.9", page: 1 },
  { src: "it-p1", host: "www.vinted.it", lang: "it-IT,it;q=0.9", page: 1 },
  { src: "de-p1", host: "www.vinted.de", lang: "de-DE,de;q=0.9", page: 1 },
];

const decode = (s) =>
  s.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

const cfg = await fetch(`${APP_URL}/api/vinted`, { headers: { "x-alert-secret": SECRET } }).then((r) => r.json());
if (!cfg.ok) throw new Error(`No pude leer las búsquedas: ${JSON.stringify(cfg)}`);

const items = [];
const samples = {};
const count = {};
let stop = false;
for (const s of SOURCES) {
  if (stop) break;
  count[s.src] = { pages: 0, items: 0, errors: 0 };
  for (const { q, set } of cfg.searches) {
    const url = `https://${s.host}/catalog?order=newest_first&search_text=${encodeURIComponent(q)}${s.page > 1 ? `&page=${s.page}` : ""}`;
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": s.lang } });
    if (!res.ok) {
      count[s.src].errors++;
      console.log(`${s.src} ${q}: ${res.status}`);
      if (res.status === 403 || res.status === 429) {
        console.log("Vinted frena: paro la medición.");
        stop = true;
        break;
      }
      continue;
    }
    const html = await res.text();
    let n = 0;
    for (const m of html.matchAll(/data-testid="product-item-id-(\d+)--overlay-link"[^>]*?title="([^"]*)"/g)) {
      items.push({ src: s.src, id: m[1], attr: decode(m[2]), q, set, host: s.host });
      n++;
    }
    if (!n && !samples[s.src]) {
      const at = html.indexOf("product-item-id");
      samples[s.src] = html.slice(Math.max(0, at - 500), at + 2500);
    }
    count[s.src].pages++;
    count[s.src].items += n;
    await sleep(5000 + Math.random() * 2000);
  }
  console.log(`${s.src} ${JSON.stringify(count[s.src])}`);
}
mkdirSync("out", { recursive: true });
writeFileSync("out/probe.json", JSON.stringify({ at: new Date().toISOString(), count, samples, items }));
console.log(`TOTAL ${items.length}`);
