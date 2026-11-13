export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

type Button = { text: string; callback_data: string };

/** Botones de voto de una alerta: "fb:bueno:<external_id>" / "fb:falso:<external_id>". */
export function feedbackButtons(externalId: string, chosen?: "bueno" | "falso"): Button[][] {
  return [[
    { text: `${chosen === "bueno" ? "✔️ " : ""}✅ Buen chollo`, callback_data: `fb:bueno:${externalId}` },
    { text: `${chosen === "falso" ? "✔️ " : ""}❌ Falso`, callback_data: `fb:falso:${externalId}` },
  ]];
}

export type FbCard = "si" | "otra" | "lote";
export type FbRef = "ok" | "alta" | "baja" | "nose";
export const FB_CARD: Record<FbCard, string> = { si: "✅ Sí, es esa", otra: "🔀 Otra paralela/carta", lote: "📦 Lote/graduada/dañada" };
export const FB_REF: Record<FbRef, string> = {
  ok: "👍 Parecido",
  alta: "📉 Se vende más barato",
  baja: "📈 Se vende más caro",
  nose: "❓ No encuentro ventas",
};

/**
 * Pregunta 1 de la alerta: ¿es la carta? (callback "c:<resp>:<external_id>").
 * Si ya se respondió que no, marca la respuesta elegida.
 */
export function cardQuestionButtons(externalId: string, chosen?: FbCard): Button[][] {
  return [
    [{ text: "1) ¿Es la carta del anuncio?", callback_data: `noop:${externalId}`.slice(0, 64) }],
    ...(Object.keys(FB_CARD) as FbCard[]).map((k) => [
      { text: `${chosen === k ? "✔️ " : ""}${FB_CARD[k]}`, callback_data: `c:${k}:${externalId}` },
    ]),
  ];
}

/** Pregunta 2: ¿qué dice 130point? (callback "r:<resp>:<external_id>"), con botón para corregir la 1. */
export function refQuestionButtons(externalId: string, refValue: number | null, chosen?: FbRef): Button[][] {
  const ref = refValue != null ? ` (referencia ${Math.round(refValue)} €)` : "";
  return [
    [{ text: `2) ¿Qué dice 130point?${ref}`, callback_data: `noop:${externalId}`.slice(0, 64) }],
    ...(Object.keys(FB_REF) as FbRef[]).map((k) => [
      { text: `${chosen === k ? "✔️ " : ""}${FB_REF[k]}`, callback_data: `r:${k}:${externalId}` },
    ]),
    [{ text: "↩️ Cambiar respuesta 1 (carta)", callback_data: `c:reset:${externalId}` }],
  ];
}

/** Voto global a partir de las dos respuestas (null = sin decidir). */
export function deriveFeedback(card: FbCard | null, ref: FbRef | null): "bueno" | "falso" | null {
  if (card === "otra" || card === "lote") return "falso";
  if (card !== "si") return null;
  if (ref === "ok" || ref === "baja") return "bueno";
  if (ref === "alta") return "falso";
  return null;
}

/** Llamada genérica a la API del bot. */
export async function telegramApi(method: string, body: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: "Telegram no configurado" };
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, telegram: await res.json() };
}

/** Envía un mensaje a tu chat de Telegram (con botones de voto si se pasa el id del chollo). */
export async function sendTelegram(text: string, opts: { dealId?: string } = {}) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!process.env.TELEGRAM_BOT_TOKEN || !chatId) return { ok: false, error: "Telegram no configurado" };
  return telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: false,
    ...(opts.dealId ? { reply_markup: { inline_keyboard: cardQuestionButtons(opts.dealId) } } : {}),
  });
}

/** Clave que Telegram manda en cada aviso al webhook (derivada de ALERT_SECRET; solo letras y números). */
export async function webhookSecret(): Promise<string | null> {
  const s = process.env.ALERT_SECRET?.trim();
  if (!s) return null;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`telegram-webhook:${s}`));
  return Buffer.from(hash).toString("hex").slice(0, 48);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
const shortDate = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "Europe/Madrid" });
};

export interface AlertComparable {
  title: string;
  price: number;
  url: string | null;
  date: string | null;
  platform: "vinted_sold" | "ebay" | "vinted";
}

/**
 * Alerta "creíble" (HTML de Telegram): precio, referencia con de dónde sale, y las ventas / anuncios
 * que forman esa referencia, cada uno con su enlace. Cabe en el pie de una foto (≤ 1.024 caracteres visibles).
 */
export function dealAlertHtml(d: {
  title: string;
  platform: string;
  price: number;
  market_value: number;
  url: string | null;
  card?: string;
  sample?: number;
  source?: "vinted_sold" | "ebay" | "vinted_open";
  note?: string;
  comps?: AlertComparable[];
  /** Texto de búsqueda de 130point para esta carta (enlace + texto para copiar). */
  point130?: string;
}): string {
  const pct = Math.round((1 - d.price / d.market_value) * 100);
  const where = d.platform === "vinted" ? "Vinted" : d.platform === "wallapop" ? "Wallapop" : d.platform;
  const sold = d.source === "vinted_sold";
  const open = d.source === "vinted_open";
  const refWhat = sold
    ? "ventas reales en Vinted"
    : open
      ? "anuncios iguales abiertos en Vinted (precio pedido, sin ventas todavía)"
      : "anuncios en eBay (precio pedido)";
  const lines: string[] = [
    `🔥 <b>Chollo -${pct}% en ${where}</b>`,
    d.card ? `🃏 ${esc(d.card)}` : "",
    `<i>${esc(d.title.slice(0, 150))}</i>`,
    "",
    `💶 Precio: <b>${eur(d.price)}</b>`,
    `📈 Referencia${d.note || open ? " (estimada)" : ""}: <b>${eur(d.market_value)}</b>${d.sample ? ` · ${d.sample} ${refWhat}` : ""}`,
    d.note ? `ℹ️ ${esc(d.note)}` : "",
  ];
  const comps = d.comps ?? [];
  if (comps.length) {
    lines.push("", sold ? "🧾 <b>Últimas ventas:</b>" : open ? "🧾 <b>Otros anuncios abiertos:</b>" : "🧾 <b>Anuncios más baratos:</b>");
    for (const c of comps) {
      const date = shortDate(c.date);
      const label = `${eur(c.price)}${date ? ` · ${sold ? "vendida" : "visto"} ${date}` : ""}`;
      lines.push(c.url ? `• <a href="${esc(c.url)}">${label}</a>` : `• ${label}`);
    }
  }
  if (d.url) lines.push("", `👉 <a href="${esc(d.url)}">Ver el anuncio en ${where}</a>`);
  if (d.point130) {
    lines.push(
      `🔎 <a href="https://130point.com/sales/?q=${encodeURIComponent(d.point130)}">Comprobar en 130point</a>`,
      `<code>${esc(d.point130)}</code>`,
    );
  }
  // El texto visible (sin etiquetas) tiene que caber en el pie de foto: si no, se quitan comparables
  const visible = (s: string) => s.replace(/<[^>]+>/g, "").length;
  const html = lines.filter((l, i, a) => l !== "" || (i > 0 && a[i - 1] !== "")).join("\n");
  if (visible(html) > 1000 && comps.length) return dealAlertHtml({ ...d, comps: comps.slice(0, -1) });
  return html;
}

/**
 * Manda una alerta de chollo: con foto si la hay (si Telegram no puede bajarla, sin foto) y botones de voto.
 */
export async function sendDealAlert(html: string, opts: { dealId: string; photo?: string | null }) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!process.env.TELEGRAM_BOT_TOKEN || !chatId) return { ok: false, error: "Telegram no configurado", photo: false };
  const reply_markup = { inline_keyboard: cardQuestionButtons(opts.dealId) };
  if (opts.photo) {
    const r = await telegramApi("sendPhoto", { chat_id: chatId, photo: opts.photo, caption: html, parse_mode: "HTML", reply_markup });
    if (r.ok) return { ...r, photo: true };
  }
  const r = await telegramApi("sendMessage", {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup,
  });
  return { ...r, photo: false };
}

export function dealMessage(d: {
  title: string;
  platform: string;
  price: number;
  market_value: number;
  url: string | null;
  card?: string;
  sample?: number;
  /** De dónde sale la referencia: ventas reales en Vinted o anuncios de eBay. */
  source?: "vinted_sold" | "ebay";
  /** Aclaración cuando la referencia viene de otra colección o numeración (fallback). */
  note?: string;
}) {
  const pct = Math.round((1 - d.price / d.market_value) * 100);
  const where = d.platform === "vinted" ? "Vinted" : d.platform === "wallapop" ? "Wallapop" : d.platform;
  return [
    `🔥 Chollo -${pct}% en ${where}`,
    d.card ? `🃏 ${d.card}` : null,
    d.title,
    `Precio: ${d.price.toFixed(2)} € · ${d.source === "vinted_sold" ? "Vendida en Vinted" : "Referencia eBay"}${
      d.note ? " (estimada)" : ""
    }: ${d.market_value.toFixed(2)} €${
      d.sample ? ` (${d.sample} ${d.source === "vinted_sold" ? "ventas" : "anuncios"})` : ""
    }`,
    d.note ? `ℹ️ ${d.note}` : null,
    d.url ?? "",
  ]
    .filter(Boolean)
    .join("\n");
}
