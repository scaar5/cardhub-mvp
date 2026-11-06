/**
 * Filtros de títulos: anuncios que NO son una carta suelta normal y que,
 * si se mezclan, estropean el valor de mercado (o generan falsos chollos).
 * Para cambiar qué se excluye, edita las listas de palabras de RULES.
 */

// Límites de palabra que entienden acentos (\b de JS no reconoce "á", "ó"...)
const words = (list: string[]) =>
  new RegExp(`(?<![\\p{L}\\d])(${list.join("|")})(?![\\p{L}\\d])`, "iu");

const RULES: { reason: string; pattern: RegExp }[] = [
  {
    reason: "lote",
    pattern: words([
      "lote", "lotes", "lot", "pack", "packs", "bundle", "set completo",
      "colecci[oó]n completa", "sobre", "sobres", "caja", "box", "blaster",
      "hobby", "starter", "[aá]lbum", "archivador", "binder",
      "\\d+\\s*(cromos|cartas|cards|tarjetas)", "x\\s?\\d+", "\\d+\\s?x",
    ]),
  },
  {
    reason: "graduada",
    pattern: words(["psa", "bgs", "beckett", "sgc", "cgc", "graded", "gradeada", "graduada"]),
  },
  {
    reason: "réplica",
    pattern: words(["reprint", "r[eé]plica", "proxy", "custom", "fan ?made", "no oficial", "fake", "copia"]),
  },
  {
    reason: "elige-tu-carta",
    pattern: words(["elige", "escoge", "elegir", "escoger", "a elegir", "a escoger", "choose", "pick", "select"]),
  },
  {
    reason: "accesorio",
    pattern: words(["funda", "fundas", "toploader", "sleeve", "sleeves", "protector", "soporte"]),
  },
];

/** Devuelve el motivo de exclusión, o null si el anuncio es una carta suelta válida. */
export function excludedReason(title: string): string | null {
  for (const r of RULES) if (r.pattern.test(title)) return r.reason;
  return null;
}

export function isComparable(title: string): boolean {
  return excludedReason(title) === null;
}
