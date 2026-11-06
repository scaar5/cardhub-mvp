// Lee los anuncios más nuevos de Vinted para cada búsqueda del catálogo y los manda a /api/vinted,
// que los reconoce y los compara con el precio de referencia de eBay.
// Lo ejecuta el workflow .github/workflows/sniper.yml. Variables: APP_URL, ALERT_SECRET.
//
// Vinted no tiene API pública: se lee la misma página de resultados que ve cualquier visitante,
// con pocas peticiones y pausas entre ellas. Si Vinted responde con un bloqueo, se para y se avisa.

const APP_URL = (process.env.APP_URL || "https://scaard5-analytics.vercel.app").replace(/\/$/, "");
const SECRET = (process.env.ALERT_SECRET || "").trim();
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const decode = (s) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** "Título, Marca: Panini, Estado: Nuevo, 8.00 €, 9.10 €" → { title, price } */
export function parseTitleAttr(attr) {
  const m = decode(attr).match(/^(.*?)(?:, Marca: [^,]*)?(?:, Talla: [^,]*)?(?:, Estado: [^,]*)?, ([\d.,]+) €(?:, [\d.,]+ €)?$/);
  if (!m) return null;
  const price = Number(m[2].replace(/,(?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(price) ? { title: m[1].trim(), price } : null;
}

export function parseCatalogHtml(html) {
  const out = [];
  for (const m of html.matchAll(/data-testid="product-item-id-(\d+)--overlay-link" title="([^"]*)"/g)) {
    const parsed = parseTitleAttr(m[2]);
    if (parsed) out.push({ id: m[1], ...parsed, url: `https://www.vinted.es/items/${m[1]}` });
  }
  return out;
}

async function main() {
  if (!SECRET) throw new Error("Falta ALERT_SECRET");
  const headers = { "x-alert-secret": SECRET };

  const cfg = await fetch(`${APP_URL}/api/vinted`, { headers }).then((r) => r.json());
  if (!cfg.ok) throw new Error(`No pude leer las búsquedas: ${JSON.stringify(cfg)}`);

  const items = [];
  const summary = [];
  for (const { q, set } of cfg.searches) {
    const url = `https://www.vinted.es/catalog?order=newest_first&search_text=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "es-ES,es;q=0.9" } });
    if (!res.ok) {
      summary.push({ q, status: res.status });
      if (res.status === 403 || res.status === 429) {
        console.log(`Vinted ha respondido ${res.status} (bloqueo o límite). Paro esta pasada.`);
        break;
      }
      continue;
    }
    const found = parseCatalogHtml(await res.text());
    summary.push({ q, found: found.length });
    for (const it of found) items.push({ ...it, set });
    await sleep(2500);
  }
  console.log(JSON.stringify(summary));

  const result = await fetch(`${APP_URL}/api/vinted`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  }).then((r) => r.json());
  console.log(JSON.stringify(result));
  if (!result.ok) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
