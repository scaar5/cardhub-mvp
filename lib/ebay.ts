/**
 * Cliente mínimo de la Browse API oficial de eBay (marketplace España).
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

/** Busca anuncios de "Cómpralo ya" en eBay.es. */
export async function searchEbay(
  q: string,
  opts: { sort?: "newlyListed"; limit?: number } = {},
): Promise<EbayItem[]> {
  const token = await getToken();
  const params = new URLSearchParams({
    q,
    limit: String(opts.limit ?? 100),
    filter: "buyingOptions:{FIXED_PRICE},priceCurrency:EUR",
  });
  if (opts.sort) params.set("sort", opts.sort);

  const res = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_ES",
      "Accept-Language": "es-ES",
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
