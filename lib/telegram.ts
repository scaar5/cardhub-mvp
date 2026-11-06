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
    ...(opts.dealId ? { reply_markup: { inline_keyboard: feedbackButtons(opts.dealId) } } : {}),
  });
}

/** Clave que Telegram manda en cada aviso al webhook (derivada de ALERT_SECRET; solo letras y números). */
export async function webhookSecret(): Promise<string | null> {
  const s = process.env.ALERT_SECRET?.trim();
  if (!s) return null;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`telegram-webhook:${s}`));
  return Buffer.from(hash).toString("hex").slice(0, 48);
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
