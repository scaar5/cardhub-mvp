// Revisa los anuncios de Vinted ya reconocidos que siguen abiertos y detecta cuáles se han VENDIDO.
// Lo ejecuta el workflow .github/workflows/vinted-sold.yml. Variables: APP_URL, ALERT_SECRET.
//
// En la página de cada anuncio Vinted incluye su estado: can_buy, is_reserved, is_hidden y el precio.
//   - can_buy=false, sin reservar ni oculto → VENDIDO (se guarda como venta con su precio)
//   - la página ya no existe (404/410)       → DESAPARECIDO (borrado: no cuenta como venta)
//   - reservado                              → se vuelve a mirar en otra pasada
// Pocas peticiones y con pausas. Si Vinted responde con un bloqueo (403/429), se para.
//
// Fotos: de cada venta se saca la foto principal del anuncio, se descarga aquí y se manda a la web,
// que guarda una miniatura en Supabase Storage. También se rellenan ventas antiguas sin foto (photo_ids).

const APP_URL = (process.env.APP_URL || "https://scaard5-analytics.vercel.app").replace(/\/$/, "");
const SECRET = (process.env.ALERT_SECRET || "").trim();
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const H = { "User-Agent": UA, "Accept-Language": "es-ES,es;q=0.9", Accept: "text/html" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX_MS = 9 * 60_000;

/** Estado de un anuncio a partir del HTML de su página. */
export function parseItemState(html, id) {
  const flag = (k) => html.match(new RegExp(`\\\\?"${k}\\\\?":(true|false)`))?.[1];
  // Los datos del anuncio están junto a su item_id (la página también trae anuncios parecidos)
  const at = html.search(new RegExp(`\\\\?"item_id\\\\?":\\\\?"?${id}`));
  const win = at >= 0 ? html.slice(Math.max(0, at - 1500), at + 1500) : html;
  const wflag = (k) => win.match(new RegExp(`\\\\?"${k}\\\\?":(true|false)`))?.[1] ?? flag(k);
  const canBuy = wflag("can_buy");
  const reserved = wflag("is_reserved");
  const hidden = wflag("is_hidden");
  const amount = win.match(/\\?"amount\\?":\\?"([\d.]+)/)?.[1];
  const price = amount ? Number(amount) : undefined;
  const raw = { can_buy: canBuy, is_reserved: reserved, is_hidden: hidden, price };
  if (canBuy === undefined) return { state: "unknown", raw };
  if (canBuy === "true") return { state: "open", raw };
  if (reserved === "true") return { state: "reserved", raw };
  if (hidden === "true") return { state: "gone", raw };
  return { state: "sold", price, raw };
}

const unescapeUrls = (s) => s.replace(/\\u002F/gi, "/").replace(/\\\//g, "/").replace(/&amp;/g, "&");

/** Foto principal del anuncio: og:image; si no, la primera foto de Vinted junto a los datos del anuncio. */
export function parsePhotoUrl(html, id) {
  const h = unescapeUrls(html);
  const og =
    h.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)?.[1] ??
    h.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i)?.[1];
  if (og && /^https:\/\/[^/]*vinted\.net\//.test(og)) return { url: og, from: "og" };
  const at = id ? h.search(new RegExp(`\\\\?"item_id\\\\?"\\s*:\\s*\\\\?"?${id}`)) : -1;
  const win = at >= 0 ? h.slice(Math.max(0, at - 4000), at + 4000) : h;
  const any = win.match(/https:\/\/images\d*\.vinted\.net\/t\/[^"'\s\\)]+/)?.[0];
  return any ? { url: any, from: at >= 0 ? "item" : "page" } : null;
}

const MAX_PHOTO_INLINE = 700_000;

/** Descarga la foto para mandarla a la web (si es muy grande, la web la descarga sola desde la URL). */
async function fetchPhoto(id, url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Referer: "https://www.vinted.es/" } });
    if (!r.ok) return { id, url };
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length && buf.length <= MAX_PHOTO_INLINE ? { id, url, data: buf.toString("base64") } : { id, url };
  } catch {
    return { id, url };
  }
}

async function main() {
  if (!SECRET) throw new Error("Falta ALERT_SECRET");
  const headers = { "x-alert-secret": SECRET };
  const cfg = await fetch(`${APP_URL}/api/vinted-sold`, { headers }).then((r) => r.json());
  if (!cfg.ok) throw new Error(`No pude leer los anuncios a revisar: ${JSON.stringify(cfg)}`);
  console.log(`Anuncios abiertos en seguimiento: ${cfg.open} (${cfg.open_10 ?? "?"} de 10 € o más). Reviso ${cfg.ids.length}.`);

  const home = await fetch("https://www.vinted.es/", { headers: H });
  const cookie = (home.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

  let retried = false;
  const started = Date.now();
  const results = [];
  const photos = [];
  let sampled = false;
  let blocked = false;
  const count = { open: 0, sold: 0, gone: 0, reserved: 0, unknown: 0 };
  for (const id of cfg.ids) {
    if (Date.now() - started > MAX_MS) break;
    const res = await fetch(`https://www.vinted.es/items/${id}`, { headers: { ...H, Cookie: cookie } });
    if (res.status === 403 || res.status === 429) {
      // Una sola espera larga y reintento; si sigue frenando, se para hasta la próxima pasada
      if (!retried) {
        retried = true;
        console.log(`Vinted ha respondido ${res.status}. Espero 60 s y sigo.`);
        await sleep(60_000);
        cfg.ids.push(id);
        continue;
      }
      console.log(`Vinted ha respondido ${res.status} (bloqueo o límite). Paro esta pasada.`);
      blocked = true;
      break;
    }
    let r;
    let html = "";
    if (res.status === 404 || res.status === 410) r = { state: "gone" };
    else if (!res.ok) r = { state: "unknown", raw: { status: res.status } };
    else r = parseItemState((html = await res.text()), id);
    count[r.state]++;
    if (html && (r.state === "sold" || !sampled)) {
      const ph = parsePhotoUrl(html, id);
      if (r.state === "sold") {
        r.raw = { ...(r.raw ?? {}), photo: ph?.from ?? "none" };
        if (ph) photos.push(await fetchPhoto(id, ph.url));
      } else {
        // Muestra para comprobar en el log que la foto se detecta bien
        sampled = true;
        console.log(`PHOTO_SAMPLE ${id} ${ph ? `${ph.from} ${ph.url}` : "none"}`);
      }
    }
    // Los no abiertos se enseñan en el log para poder comprobar que la detección es correcta
    if (r.state !== "open") console.log(`ITEM ${id} ${r.state} ${JSON.stringify(r.raw ?? {})}`);
    results.push({ id, state: r.state, price: r.price });
    await sleep(5000 + Math.random() * 2000);
  }
  console.log(`TOTAL ${JSON.stringify(count)}`);

  // Ventas antiguas sin foto: se abre su página (sigue existiendo tras la venta) y se saca la foto
  let backfill = 0;
  for (const id of blocked ? [] : cfg.photo_ids ?? []) {
    if (Date.now() - started > MAX_MS + 60_000) break;
    const res = await fetch(`https://www.vinted.es/items/${id}`, { headers: { ...H, Cookie: cookie } });
    if (res.status === 403 || res.status === 429) {
      console.log(`Vinted ha respondido ${res.status} con las fotos. Paro.`);
      break;
    }
    const ph = res.ok ? parsePhotoUrl(await res.text(), id) : null;
    console.log(`PHOTO_OLD ${id} ${res.status} ${ph?.from ?? "none"}`);
    if (ph) {
      photos.push(await fetchPhoto(id, ph.url));
      backfill++;
    }
    await sleep(5000 + Math.random() * 2000);
  }
  console.log(`PHOTOS ${JSON.stringify({ new_sales: photos.length - backfill, old_sales: backfill })}`);

  const out = await fetch(`${APP_URL}/api/vinted-sold`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ results, photos }),
  }).then((r) => r.json());
  console.log(`RESULT ${JSON.stringify(out)}`);
  if (!out.ok) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
