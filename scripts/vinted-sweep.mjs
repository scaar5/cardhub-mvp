// Repaso COMPLETO de Vinted (vigilancia total), desde MIN_PRICE € (5 € desde el 13-nov; antes 10 €).
// SHARDS/SHARD: varios trabajos en paralelo, cada uno con una parte de las búsquedas (índice % SHARDS).
// Cada vuelta recorre todas las búsquedas del sniper, todas sus páginas; si una búsqueda llega al tope de Vinted
// (~11 páginas, ~950 anuncios), la trocea por tramos de precio. Censo del 7-nov: ~750 peticiones, ~85 min por vuelta,
// 6.467 anuncios de cartas del catálogo (≥10 €).
// Todo se manda a /api/vinted con backfill: true → se guarda / actualiza seen_at en `listings`, SIN alertas.
// Así, un anuncio que deja de verse es casi seguro vendido o borrado: /api/vinted-sold lo revisa el primero.
// Lo ejecuta .github/workflows/vinted-sweep.yml (LOOP_MINUTES=110: vueltas seguidas hasta agotar el tiempo).
import { parseCatalogHtml } from "./vinted-scan.mjs";

const APP_URL = (process.env.APP_URL || "https://scaard5-analytics.vercel.app").replace(/\/$/, "");
const SECRET = (process.env.ALERT_SECRET || "").trim();
const MIN_PRICE = Number(process.env.MIN_PRICE || 10);
const LOOP_MINUTES = Number(process.env.LOOP_MINUTES || 0); // 0 = una sola vuelta
const MAX_PAGES = 12;
const CAP = 850;
const BLOCK_PAUSE_MIN = 30;
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const SHARDS = Math.max(1, Number(process.env.SHARDS || 1));
const SHARD = Number(process.env.SHARD || 0);
const BANDS = [5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 75, 100, 150, 250, 500, 100000]
  .filter((b, i, a) => b >= MIN_PRICE || a[i + 1] > MIN_PRICE)
  .map((b) => Math.max(b, MIN_PRICE));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const headers = { "x-alert-secret": SECRET };
const started = Date.now();
const timeLeft = () => !LOOP_MINUTES || Date.now() - started < LOOP_MINUTES * 60000;

let requests = 0;
class Blocked extends Error {}

async function getPage(q, from, to, page) {
  const url =
    `https://www.vinted.es/catalog?order=newest_first&search_text=${encodeURIComponent(q)}` +
    `&price_from=${from}&price_to=${to}&currency=EUR${page > 1 ? `&page=${page}` : ""}`;
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "es-ES,es;q=0.9" } });
  requests++;
  await sleep(5000 + Math.random() * 2000);
  if (res.status === 403 || res.status === 429) throw new Blocked(String(res.status));
  if (!res.ok) return null;
  return parseCatalogHtml(await res.text());
}

/** Todas las páginas de una búsqueda en un tramo de precio. */
async function crawl(q, from, to, out) {
  const ids = new Set();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const found = await getPage(q, from, to, page);
    if (!found || !found.length) break;
    let fresh = 0;
    for (const { photo, photo_how, ...it } of found) {
      if (ids.has(it.id)) continue;
      ids.add(it.id);
      fresh++;
      out.set(it.id, it);
    }
    if (!fresh || found.length < 80) break;
  }
  return ids.size;
}

async function crawlBand(q, from, to, out, depth = 0) {
  const n = await crawl(q, from, to, out);
  if (n >= CAP && to - from > 0.5 && depth < 4) {
    const mid = Math.round(((from + Math.min(to, from * 4 + 10)) / 2) * 2) / 2;
    await crawlBand(q, from, mid, out, depth + 1);
    await crawlBand(q, mid, to, out, depth + 1);
  }
}

async function post(items) {
  const res = await fetch(`${APP_URL}/api/vinted`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ items, backfill: true }),
  });
  return res.json().catch(() => ({ ok: false, status: res.status }));
}

async function sweepOnce(n) {
  const cfg = await fetch(`${APP_URL}/api/vinted`, { headers }).then((r) => r.json());
  if (!cfg.ok) throw new Error(`No pude leer las búsquedas: ${JSON.stringify(cfg)}`);
  const t0 = Date.now(), r0 = requests;
  const total = { searches: 0, seen: 0, recognized: 0 };
  const mine = cfg.searches.filter((_, i) => i % SHARDS === SHARD);
  for (const { q, set } of mine) {
    if (!timeLeft()) break;
    const out = new Map();
    const n0 = await crawl(q, MIN_PRICE, 100000, out);
    if (n0 >= CAP) for (let i = 0; i + 1 < BANDS.length && timeLeft(); i++) await crawlBand(q, BANDS[i], BANDS[i + 1], out);
    const items = [...out.values()].map((it) => ({ ...it, set }));
    const r = items.length ? await post(items) : { ok: true };
    total.searches++;
    total.seen += items.length;
    total.recognized += r.recognized ?? 0;
    console.log(`SWEEP_Q ${JSON.stringify({ q, seen: items.length, recognized: r.recognized, ok: r.ok, error: r.error })}`);
  }
  console.log(`SWEEP ${JSON.stringify({ vuelta: n, shard: `${SHARD}/${SHARDS}`, ...total, requests: requests - r0, minutes: Math.round((Date.now() - t0) / 60000) })}`);
}

async function main() {
  if (!SECRET) throw new Error("Falta ALERT_SECRET");
  let n = 0;
  do {
    n++;
    try {
      await sweepOnce(n);
    } catch (e) {
      if (!(e instanceof Blocked)) throw e;
      console.log(`Vinted ha respondido ${e.message}. Espero ${BLOCK_PAUSE_MIN} min.`);
      if (!LOOP_MINUTES) process.exit(1);
      await sleep(BLOCK_PAUSE_MIN * 60000);
    }
  } while (LOOP_MINUTES && timeLeft());
  console.log(`FIN ${n} vueltas, ${requests} peticiones, ${Math.round((Date.now() - started) / 60000)} min`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
