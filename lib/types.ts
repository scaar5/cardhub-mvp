export type Platform = "vinted" | "wallapop";

export interface Deal {
  id: string;
  title: string;
  platform: Platform;
  price: number;
  market_value: number;
  url: string | null;
  created_at: string;
}

/** % de descuento frente al valor de mercado */
export function discount(d: Pick<Deal, "price" | "market_value">): number {
  if (!d.market_value) return 0;
  return Math.round((1 - d.price / d.market_value) * 100);
}
