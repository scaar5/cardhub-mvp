export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

/** Envía un mensaje a tu chat de Telegram. */
export async function sendTelegram(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { ok: false, error: "Telegram no configurado" };

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: false }),
  });
  const data = await res.json();
  return { ok: res.ok, telegram: data };
}

export function dealMessage(d: {
  title: string;
  platform: string;
  price: number;
  market_value: number;
  url: string | null;
  card?: string;
  sample?: number;
}) {
  const pct = Math.round((1 - d.price / d.market_value) * 100);
  const where = d.platform === "vinted" ? "Vinted" : d.platform === "wallapop" ? "Wallapop" : d.platform;
  return [
    `🔥 Chollo -${pct}% en ${where}`,
    d.card ? `🃏 ${d.card}` : null,
    d.title,
    `Precio: ${d.price.toFixed(2)} € · Referencia eBay: ${d.market_value.toFixed(2)} €${
      d.sample ? ` (${d.sample} anuncios)` : ""
    }`,
    d.url ?? "",
  ]
    .filter(Boolean)
    .join("\n");
}
