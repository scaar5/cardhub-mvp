// Revisa los anuncios de Vinted ya reconocidos que siguen abiertos y detecta cuáles se han VENDIDO.
// Lo ejecuta el workflow .github/workflows/vinted-sold.yml. Variables: APP_URL, ALERT_SECRET.
//
// En la página de cada anuncio Vinted incluye su estado: can_buy, is_reserved, is_hidden y el precio.
//   - can_buy=false, sin reservar ni oculto → VENDIDO (se guarda como venta con su precio)
//   - la página ya no existe (404/410)       → DESAPARECIDO (borrado: no cuenta como venta)
//   - reservado                              → se vuelve a mirar en otra pasada
// Pocas peticiones y con pausas. Si Vinted responde con un bloqueo (403/429), se para.

const APP_URL = (process.env.APP_URL || "https://scaard5-analytics.vercel.app").replace(/\/$/, "");
const SECRET = (process.env.ALERT_SECRET || "").trim();
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const H = { "User-Agent": UA, "Accept-Language": "es-ES,es;q=0.9", Accept: "text/html" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX_MS = 7 * 60_000;

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

async function main() {
  if (!SECRET) throw new Error("Falta ALERT_SECRET");
  const headers = { "x-alert-secret": SECRET };
  const cfg = await fetch(`${APP_URL}/api/vinted-sold`, { headers }).then((r) => r.json());
  if (!cfg.ok) throw new Error(`No pude leer los anuncios a revisar: ${JSON.stringify(cfg)}`);
  console.log(`Anuncios abiertos en seguimiento: ${cfg.open}. Reviso ${cfg.ids.length}.`);

  const home = await fetch("https://www.vinted.es/", { headers: H });
  const cookie = (home.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

  let retried = false;
  const started = Date.now();
  const results = [];
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
      break;
    }
    let r;
    if (res.status === 404 || res.status === 410) r = { state: "gone" };
    else if (!res.ok) r = { state: "unknown", raw: { status: res.status } };
    else r = parseItemState(await res.text(), id);
    count[r.state]++;
    // Los no abiertos se enseñan en el log para poder comprobar que la detección es correcta
    if (r.state !== "open") console.log(`ITEM ${id} ${r.state} ${JSON.stringify(r.raw ?? {})}`);
    results.push({ id, state: r.state, price: r.price });
    await sleep(5000 + Math.random() * 2000);
  }
  console.log(`TOTAL ${JSON.stringify(count)}`);

  const out = await fetch(`${APP_URL}/api/vinted-sold`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ results }),
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
