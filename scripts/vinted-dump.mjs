// Diagnóstico: descarga los mismos resultados de Vinted que ve el sniper y los guarda en out/vinted.json
// (sin reconocer ni guardar nada en la base de datos). Lo ejecuta .github/workflows/vinted-dump.yml,
// que deja el archivo en la rama "vinted-raw" para analizar el reconocedor sin conexión.
import { writeFileSync, mkdirSync } from "node:fs";
import { parseCatalogHtml } from "./vinted-scan.mjs";

const APP_URL = (process.env.APP_URL || "https://scaard5-analytics.vercel.app").replace(/\/$/, "");
const SECRET = (process.env.ALERT_SECRET || "").trim();
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cfg = await fetch(`${APP_URL}/api/vinted`, { headers: { "x-alert-secret": SECRET } }).then((r) => r.json());
if (!cfg.ok) throw new Error(`No pude leer las búsquedas: ${JSON.stringify(cfg)}`);
const items = [];
for (const { q, set } of cfg.searches) {
  const res = await fetch(`https://www.vinted.es/catalog?order=newest_first&search_text=${encodeURIComponent(q)}`, {
    headers: { "User-Agent": UA, "Accept-Language": "es-ES,es;q=0.9" },
  });
  if (!res.ok) {
    console.log(`${q}: ${res.status}`);
    if (res.status === 403 || res.status === 429) break;
    continue;
  }
  const found = parseCatalogHtml(await res.text());
  console.log(`${q}: ${found.length}`);
  for (const it of found) items.push({ ...it, set, q });
  await sleep(2500);
}
mkdirSync("out", { recursive: true });
writeFileSync("out/vinted.json", JSON.stringify(items));
console.log(`TOTAL ${items.length}`);
