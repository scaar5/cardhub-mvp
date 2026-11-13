import { median } from "./market";
import { PLAYERS } from "./players";

/**
 * Tendencias por jugador a partir de las ventas reales de Vinted (`vinted_sold`) y los anuncios abiertos (`vinted`).
 *
 *  - Volumen: ventas de los últimos 7 días frente a los 7 anteriores.
 *  - Precio (índice tipo CardLadder): cada venta se compara con el precio habitual de ESA carta y variante
 *    (mediana de todas sus ventas) → ratio. El índice de un jugador es la mediana de esos ratios. Se compara
 *    el índice de los últimos 7 días con el de los 8–30 anteriores. Así no se mezcla una base de 5 € con una /10.
 *  - Oferta / demanda: ventas por semana frente a anuncios abiertos ahora → "semanas de stock".
 */

const DAY = 86400_000;

// card_id → jugadores (una carta doble cuenta para cada uno)
const playersByCard = new Map<string, { slug: string; name: string }[]>();
for (const p of PLAYERS) {
  for (const c of p.cards) {
    const arr = playersByCard.get(c.id) ?? [];
    arr.push({ slug: p.slug, name: p.name });
    playersByCard.set(c.id, arr);
  }
}

export interface Sale {
  card_id: string;
  parallel: string | null;
  price: number;
  seen_at: string;
}
export interface Ask {
  card_id: string;
}

export interface PlayerTrend {
  slug: string;
  name: string;
  sales7: number;
  salesPrev7: number;
  volumeChangePct: number | null; // null si la semana anterior no tuvo ventas
  // Precio
  indexNow: number | null; // mediana de ratios últimos 7 días (1 = precio habitual)
  indexBefore: number | null; // 8–30 días
  priceChangePct: number | null;
  priceSamples: [number, number]; // ventas con ratio en cada ventana
  weekly: (number | null)[]; // índice semanal, 6 semanas (la última = esta)
  // Oferta / demanda
  open: number;
  weeksOfStock: number | null; // anuncios abiertos / ventas por semana
  medianPrice7: number | null;
}

export const MIN_VOLUME = 4; // ventas en la semana (actual o anterior) para salir en "más vendidos" con %
export const MIN_PRICE_SAMPLES = 3; // ventas con ratio en cada ventana para dar subida/bajada
export const MIN_KEY_SALES = 2; // ventas de una carta+variante para tener "precio habitual"

export function computeTrends(sales: Sale[], asks: Ask[], now = Date.now()) {
  const key = (s: { card_id: string; parallel: string | null }) => `${s.card_id}|${s.parallel ?? ""}`;

  // Precio habitual de cada carta+variante
  const byKey = new Map<string, number[]>();
  for (const s of sales) {
    const arr = byKey.get(key(s)) ?? [];
    arr.push(s.price);
    byKey.set(key(s), arr);
  }
  const baseline = new Map<string, number>();
  for (const [k, v] of byKey) if (v.length >= MIN_KEY_SALES) baseline.set(k, median(v));

  type Acc = {
    name: string;
    s7: number;
    sp7: number;
    rNow: number[];
    rBefore: number[];
    weeks: number[][];
    prices7: number[];
    open: number;
  };
  const acc = new Map<string, Acc>();
  const get = (p: { slug: string; name: string }) => {
    let a = acc.get(p.slug);
    if (!a) {
      a = { name: p.name, s7: 0, sp7: 0, rNow: [], rBefore: [], weeks: [[], [], [], [], [], []], prices7: [], open: 0 };
      acc.set(p.slug, a);
    }
    return a;
  };

  for (const s of sales) {
    const players = playersByCard.get(s.card_id);
    if (!players) continue;
    const age = (now - Date.parse(s.seen_at)) / DAY;
    const base = baseline.get(key(s));
    const ratio = base ? s.price / base : null;
    for (const p of players) {
      const a = get(p);
      if (age < 7) {
        a.s7++;
        a.prices7.push(s.price);
        if (ratio !== null) a.rNow.push(ratio);
      } else if (age < 14) a.sp7++;
      if (ratio !== null && age >= 7 && age < 30) a.rBefore.push(ratio);
      const w = Math.floor(age / 7);
      if (ratio !== null && w < 6) a.weeks[5 - w].push(ratio);
    }
  }
  for (const o of asks) {
    for (const p of playersByCard.get(o.card_id) ?? []) get(p).open++;
  }

  const out: PlayerTrend[] = [];
  for (const [slug, a] of acc) {
    const indexNow = a.rNow.length >= MIN_PRICE_SAMPLES ? median(a.rNow) : null;
    const indexBefore = a.rBefore.length >= MIN_PRICE_SAMPLES ? median(a.rBefore) : null;
    out.push({
      slug,
      name: a.name,
      sales7: a.s7,
      salesPrev7: a.sp7,
      volumeChangePct: a.sp7 ? Math.round(((a.s7 - a.sp7) / a.sp7) * 100) : null,
      indexNow,
      indexBefore,
      priceChangePct: indexNow !== null && indexBefore !== null ? Math.round((indexNow / indexBefore - 1) * 100) : null,
      priceSamples: [a.rNow.length, a.rBefore.length],
      weekly: a.weeks.map((w) => (w.length >= 2 ? median(w) : null)),
      open: a.open,
      weeksOfStock: a.s7 ? Math.round((a.open / a.s7) * 10) / 10 : null,
      medianPrice7: a.prices7.length ? median(a.prices7) : null,
    });
  }

  const firstSale = sales.reduce((m, s) => Math.min(m, Date.parse(s.seen_at)), now);
  const daysOfData = Math.floor((now - firstSale) / DAY);

  return {
    daysOfData,
    totalSales7: sales.filter((s) => now - Date.parse(s.seen_at) < 7 * DAY).length,
    // Más vendidos esta semana
    topVolume: out
      .filter((p) => p.sales7 > 0)
      .sort((a, b) => b.sales7 - a.sales7 || b.sales7 - b.salesPrev7 - (a.sales7 - a.salesPrev7))
      .slice(0, 15),
    // Más crecimiento en ventas (con un mínimo para que el % signifique algo)
    risingVolume: out
      .filter((p) => Math.max(p.sales7, p.salesPrev7) >= MIN_VOLUME && p.sales7 > p.salesPrev7)
      .sort((a, b) => b.sales7 - b.salesPrev7 - (a.sales7 - a.salesPrev7))
      .slice(0, 10),
    // Precio
    priceUp: out
      .filter((p) => p.priceChangePct !== null && p.priceChangePct > 0)
      .sort((a, b) => b.priceChangePct! - a.priceChangePct!)
      .slice(0, 10),
    priceDown: out
      .filter((p) => p.priceChangePct !== null && p.priceChangePct < 0)
      .sort((a, b) => a.priceChangePct! - b.priceChangePct!)
      .slice(0, 10),
    // Más demanda que oferta: los que menos semanas de stock tienen (relativo: siempre se ve más oferta que ventas,
    // porque no todo lo que se vende se detecta; lo útil es la comparación entre jugadores)
    hot: out
      .filter((p) => p.sales7 >= 3 && p.weeksOfStock !== null)
      .sort((a, b) => a.weeksOfStock! - b.weeksOfStock! || b.sales7 - a.sales7)
      .slice(0, 12),
    // Más oferta que demanda: muchos anuncios y pocas ventas
    cold: out
      .filter((p) => p.open >= 25 && (p.weeksOfStock === null || p.weeksOfStock > 8))
      .sort((a, b) => (b.weeksOfStock ?? Infinity) - (a.weeksOfStock ?? Infinity) || b.open - a.open)
      .slice(0, 12),
  };
}
