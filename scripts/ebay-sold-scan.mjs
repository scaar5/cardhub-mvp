// Lee las VENTAS REALES de eBay.es (búsqueda con el filtro "Artículos vendidos") para cada búsqueda
// del catálogo y las manda a /api/ebay-sold, que reconoce la carta y las guarda como referencia.
// Lo ejecuta el workflow .github/workflows/ebay-sold.yml. Variables: APP_URL, ALERT_SECRET.
//
// - Las ventas por "Mejor oferta aceptada" se DESCARTAN: eBay oculta el importe real y solo enseña el
//   precio pedido (tacharlo como venta a ese precio inflaría la referencia).
// - eBay no da una API pública de vendidos: se lee la misma página que ve cualquier visitante, con
//   pausas entre peticiones. Si eBay responde con un bloqueo, se para y se avisa.

const APP_URL = (process.env.APP_URL || "https://scaard5-analytics.vercel.app").replace(/\/$/, "");
const SECRET = (process.env.ALERT_SECRET || "").trim();
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const BROWSER_HEADERS = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "sec-ch-ua": '"Chromium";v="141", "Google Chrome";v="141", "Not?A_Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const decode = (s) =>
  s
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
const text = (html) => decode(html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

const MONTHS = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, sept: 8, oct: 9, nov: 10, dic: 11 };

/** "Vendido 3 nov 2026" / "Vendido el 3 nov. 2026" → ISO */
export function parseSoldDate(t) {
  const m = t.match(/Vendido(?:\s+el)?\s+(\d{1,2})\s+([a-zé]{3,4})\.?\s+(\d{4})/i);
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase().replace("é", "e")];
  if (month === undefined) return null;
  return new Date(Date.UTC(Number(m[3]), month, Number(m[1]), 12)).toISOString();
}

/** "17,00 EUR" / "EUR 1.234,50" / "17,00 €" → 17 · rangos ("10,00 EUR a 20,00 EUR") → null */
export function parsePrice(t) {
  if (/\d\s*(EUR|€)?\s+a\s+(EUR\s*)?\d/i.test(t)) return null;
  const m = t.match(/(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})/);
  if (!m) return null;
  return Number(`${m[1].replace(/\./g, "")}.${m[2]}`);
}

/** Saca las ventas de una página de resultados de eBay.es (formatos s-card y s-item). */
export function parseSoldHtml(html) {
  const out = [];
  let bestOffer = 0;
  // Lo que viene tras "menos palabras" ya no coincide con la búsqueda
  const cut = html.search(/Resultados que coinciden con menos palabras|Results matching fewer words/i);
  const body = cut > 0 ? html.slice(0, cut) : html;
  const seen = new Set();
  for (const chunk of body.split(/<li\b/).slice(1)) {
    const id = chunk.match(/\/itm\/(?:[^"/?]*\/)?(\d{10,})/)?.[1];
    if (!id || seen.has(id)) continue;
    const t = text(`<li${chunk}`);
    const soldAt = parseSoldDate(t);
    if (!soldAt) continue;
    seen.add(id);
    if (/mejor oferta aceptada|best offer accepted/i.test(t)) {
      bestOffer++;
      continue;
    }
    const titleHtml =
      chunk.match(/class="[^"]*(?:s-card__title|s-item__title)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|span|h3)>/)?.[1] ??
      chunk.match(/<img[^>]+alt="([^"]+)"/)?.[1] ??
      "";
    const title = text(titleHtml)
      .replace(/^(Nuevo anuncio|New listing)\s*/i, "")
      .replace(/\s*(Se abre en una ventana o pestaña nueva|Opens in a new window or tab)\s*$/i, "")
      .trim();
    const priceHtml = chunk.match(/class="[^"]*(?:s-card__price|s-item__price)[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div)>/);
    // Precio tachado = venta por oferta con importe oculto
    if (priceHtml && /STRIKETHROUGH|strikethrough|<s>|<del>/i.test(priceHtml[0])) {
      bestOffer++;
      continue;
    }
    const price = parsePrice(text(priceHtml?.[1] ?? ""));
    if (!title || !price) continue;
    out.push({ id, title, price, soldAt, url: `https://www.ebay.es/itm/${id}` });
  }
  return { items: out, bestOffer };
}

async function main() {
  if (!SECRET) throw new Error("Falta ALERT_SECRET");
  const headers = { "x-alert-secret": SECRET };

  const cfg = await fetch(`${APP_URL}/api/ebay-sold`, { headers }).then((r) => r.json());
  if (!cfg.ok) throw new Error(`No pude leer las búsquedas: ${JSON.stringify(cfg)}`);

  // Primero la portada, como un navegador, para recibir las cookies de sesión
  const home = await fetch("https://www.ebay.es/", { headers: BROWSER_HEADERS });
  const cookie = (home.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  console.log(`Portada eBay: ${home.status}, cookies: ${cookie ? "sí" : "no"}`);
  await sleep(2000);

  const items = [];
  const summary = [];
  let skippedBestOffer = 0;
  let firstHtml = null;
  for (const { q, set } of cfg.searches) {
    const url = `https://www.ebay.es/sch/i.html?_nkw=${encodeURIComponent(q)}&LH_Sold=1&LH_Complete=1&_sop=13&_ipg=240`;
    const res = await fetch(url, { headers: { ...BROWSER_HEADERS, ...(cookie ? { Cookie: cookie } : {}) } });
    const html = await res.text();
    if (!res.ok || /Pardon Our Interruption|captcha|Disculpa la interrupción/i.test(html)) {
      summary.push({ q, status: res.status, blocked: true, page: html.match(/<title>([^<]*)/)?.[1] ?? "" });
      console.log(`eBay ha respondido ${res.status} o con un bloqueo. Paro esta pasada.`);
      const probe = await fetch(`${APP_URL}/api/ebay-sold?probe=1`, { headers }).then((r) => r.json()).catch((e) => String(e));
      console.log(`PROBE_VERCEL ${JSON.stringify(probe)}`);
      break;
    }
    firstHtml ??= html;
    const { items: found, bestOffer } = parseSoldHtml(html);
    skippedBestOffer += bestOffer;
    summary.push({ q, sold: found.length, best_offer: bestOffer });
    for (const it of found) items.push({ ...it, set });
    await sleep(3000);
  }
  console.log(JSON.stringify(summary));
  console.log(`TOTAL ventas=${items.length} descartadas_mejor_oferta=${skippedBestOffer}`);

  // Si no se ha leído nada, enseñar un trozo del HTML para poder ajustar el lector
  if (items.length === 0 && firstHtml) {
    const i = firstHtml.search(/\/itm\/\d{10,}/);
    console.log("DEBUG_HTML", firstHtml.length, firstHtml.slice(Math.max(0, i - 1500), i + 1500));
  }

  const totals = { received: 0, recognized: 0, saved: 0 };
  for (let i = 0; i < items.length; i += 1000) {
    const result = await fetch(`${APP_URL}/api/ebay-sold`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ items: items.slice(i, i + 1000) }),
    }).then((r) => r.json());
    if (!result.ok) {
      console.log(JSON.stringify(result));
      process.exit(1);
    }
    totals.received += result.received;
    totals.recognized += result.recognized;
    totals.saved += result.saved;
  }
  console.log(`RESULT ${JSON.stringify(totals)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
