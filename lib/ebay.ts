/**
 * Cliente mínimo de la Browse API oficial de eBay (España por defecto; también Alemania, Italia y Francia, todos en euros).
 * Necesita EBAY_CLIENT_ID y EBAY_CLIENT_SECRET (claves de "Production" de developer.ebay.com).
 */

export interface EbayItem {
  id: string;
  title: string;
  price: number;
  url: string;
  createdAt: string | null;
}

let cachedToken: { value: string; expires: number } | null = null;

export function ebayConfigured(): boolean {
  return Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);
}

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;

  const id = process.env.EBAY_CLIENT_ID;
  const secret = process.env.EBAY_CLIENT_SECRET;
  if (!id || !secret) throw new Error("eBay no configurado (faltan EBAY_CLIENT_ID / EBAY_CLIENT_SECRET)");

  const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`eBay token ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

interface RawSummary {
  itemId: string;
  title: string;
  price?: { value: string; currency: string };
  itemWebUrl: string;
  itemCreationDate?: string;
}

/**
 * Mercados de eBay que usan euros (no hace falta convertir moneda: precios exactos).
 * Medido (7-nov): eBay.es ya enseña casi todos los anuncios de Italia (EBAY_IT repite ~95 %),
 * pero Alemania aporta anuncios nuevos. Por eso: España (con 2.ª página si llega al tope) + Alemania.
 */
export type EbayMarket = "EBAY_ES" | "EBAY_IT" | "EBAY_DE" | "EBAY_FR";
export const EBAY_EUR_MARKETS: EbayMarket[] = ["EBAY_ES", "EBAY_DE"];
const LANG: Record<EbayMarket, string> = {
  EBAY_ES: "es-ES",
  EBAY_IT: "it-IT",
  EBAY_DE: "de-DE",
  EBAY_FR: "fr-FR",
};

/** Busca la misma consulta en varios mercados de eBay a la vez, sin repetir anuncios. */
export async function searchEbayMarkets(
  q: string,
  markets: EbayMarket[] = EBAY_EUR_MARKETS,
  opts: { limit?: number } = {},
): Promise<{ items: EbayItem[]; byMarket: Record<string, number | string> }> {
  const limit = opts.limit ?? 200;
  const results = await Promise.allSettled(
    markets.map(async (m) => {
      const first = await searchEbay(q, { limit, market: m });
      // España llena (200): pedir la 2.ª página, que trae anuncios que no salen en ningún otro mercado
      if (m === "EBAY_ES" && first.length >= limit) {
        try {
          return [...first, ...(await searchEbay(q, { limit, market: m, offset: limit }))];
        } catch {
          return first;
        }
      }
      return first;
    }),
  );
  const seen = new Map<string, EbayItem>();
  const byMarket: Record<string, number | string> = {};
  results.forEach((r, i) => {
    const m = markets[i].slice(5);
    if (r.status === "rejected") {
      byMarket[m] = "error";
      return;
    }
    byMarket[m] = r.value.length;
    // El mismo anuncio puede salir en varios mercados: se queda el primero (España va primero)
    for (const it of r.value) if (!seen.has(it.id)) seen.set(it.id, it);
  });
  if (results.every((r) => r.status === "rejected")) throw (results[0] as PromiseRejectedResult).reason;
  return { items: [...seen.values()], byMarket };
}

/** Busca anuncios de "Cómpralo ya" en un mercado de eBay (por defecto eBay.es), solo en euros. */
export async function searchEbay(
  q: string,
  opts: { sort?: "newlyListed"; limit?: number; market?: EbayMarket; offset?: number } = {},
): Promise<EbayItem[]> {
  const token = await getToken();
  const market = opts.market ?? "EBAY_ES";
  const params = new URLSearchParams({
    q,
    limit: String(opts.limit ?? 100),
    filter: "buyingOptions:{FIXED_PRICE},priceCurrency:EUR",
  });
  if (opts.sort) params.set("sort", opts.sort);
  if (opts.offset) params.set("offset", String(opts.offset));

  const res = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": market,
      "Accept-Language": LANG[market],
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`eBay search ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as { itemSummaries?: RawSummary[] };
  return (data.itemSummaries ?? [])
    .filter((it) => it.price && it.price.currency === "EUR")
    .map((it) => ({
      id: it.itemId,
      title: it.title,
      price: Number(it.price!.value),
      url: it.itemWebUrl,
      createdAt: it.itemCreationDate ?? null,
    }));
}
