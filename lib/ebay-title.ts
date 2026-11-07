/**
 * eBay España y Alemania TRADUCEN AUTOMÁTICAMENTE los títulos de los anuncios de otros países
 * ("Topps Chrome" → "Topps Cromo", "Sapphire" → "Zafiro", "Rookie" → "Novato", "Purple" → "Púrpura"…).
 * El reconocedor espera los nombres originales, así que se deshace la traducción antes de reconocer.
 * Medido el 7-nov: en las búsquedas de "topps chrome", ~80 % de lo no reconocido era "colección no reconocida"
 * por esto (p. ej. "2026 Topps Cromo Premier League David Raya Refractor Púrpura/75 #17").
 *
 * Solo para títulos de eBay: en Vinted "cromo" es un cromo de verdad (pegatina, Panini Megacracks…).
 */
const RULES: [RegExp, string][] = [
  // Productos
  [/\b(cromo|cromos|cromado|cromada|cromados|cromadas|chrom)\b/gi, "Chrome"],
  [/\b(zafiro|saphir)\b/gi, "Sapphire"],
  [/\bestadio club\b/gi, "Stadium Club"],
  [/\bclub del estadio\b/gi, "Stadium Club"],
  [/\b(colecci[oó]n (del )?museo|museo colecci[oó]n|museumssammlung)\b/gi, "Museum Collection"],
  [/\b(liga de (los )?campeones|campeones liga|campeones de la liga)\b/gi, "Champions League"],
  // Tipo de carta
  [/\b(novato|novata|novatos|neuling)\b/gi, "Rookie"],
  [/\b(autom[aá]tico|autom[aá]tica|autogr[aá]fico)\b/gi, "Auto"],
  [/\b(refractario|refractaria|refraktor)\b/gi, "Refractor"],
  [/\bmini diamantes\b/gi, "Mini Diamond"],
  // Colores (las paralelas se reconocen por el color en inglés)
  [/\b(p[uú]rpura|morado|morada|lila)\b/gi, "Purple"],
  [/\b(verde|gr[uü]n)\b/gi, "Green"],
  [/\b(azul|blau)\b/gi, "Blue"],
  [/\b(rojo|roja|rot)\b/gi, "Red"],
  [/\b(naranja)\b/gi, "Orange"],
  [/\b(rosa|rosado)\b/gi, "Pink"],
  [/\b(oro|dorado|dorada)\b/gi, "Gold"],
  [/\b(negro|negra|schwarz)\b/gi, "Black"],
  [/\b(amarillo|amarilla|gelb)\b/gi, "Yellow"],
  [/\b(plata|plateado|plateada|silber)\b/gi, "Silver"],
  [/\b(blanco|blanca)\b/gi, "White"],
];

export function untranslateEbayTitle(title: string): string {
  let t = title;
  for (const [re, to] of RULES) t = t.replace(re, to);
  return t;
}
