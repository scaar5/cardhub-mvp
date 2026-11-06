import { EXTREME_MIN_SAMPLE, EXTREME_PCT, MIN_REF_VALUE, SAVE_THRESHOLD } from "./config";
import type { ResolvedReference } from "./reference";

/**
 * ¿Es chollo este precio frente a esta referencia? Devuelve el % de descuento, o el motivo por el que no.
 * La usan el sniper de Vinted y la limpieza de chollos guardados (/api/deals-recheck), con las mismas reglas.
 */
export function judgeDeal(price: number, ref: ResolvedReference | null): { pct: number } | { reject: string } {
  if (!ref) return { reject: "sin referencia" };
  if (ref.value < MIN_REF_VALUE) return { reject: `carta de menos de ${MIN_REF_VALUE} €` };
  const pct = Math.round((1 - price / ref.value) * 100);
  if (pct < SAVE_THRESHOLD) return { reject: `descuento de solo ${pct} %` };
  // Descuento extremo con pocos anuncios de eBay detrás: casi siempre es la referencia la que está inflada
  if (pct >= EXTREME_PCT && ref.source === "ebay" && ref.sample < EXTREME_MIN_SAMPLE) {
    return { reject: `-${pct} % con solo ${ref.sample} anuncios de eBay` };
  }
  return { pct };
}
