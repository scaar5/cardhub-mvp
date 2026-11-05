/**
 * Configuración del sniper. Cambia aquí qué busca y a partir de qué descuento avisa.
 */

/** Búsquedas que el sniper vigila en eBay España. */
export const SEARCHES: string[] = [
  "panini adrenalyn",
  "topps chrome futbol",
  "panini prizm futbol",
  "topps match attax",
  "panini megacracks",
];

/** Descuento mínimo (%) para guardar un anuncio en la tabla. */
export const SAVE_THRESHOLD = 20;

/** Descuento mínimo (%) para mandar alerta por Telegram. */
export const ALERT_THRESHOLD = 30;

/** Nº mínimo de anuncios comparables para fiarse del valor de mercado. */
export const MIN_SAMPLE = 8;

/** Precio mínimo (€) para descartar morralla y anuncios trampa de 0,01 €. */
export const MIN_PRICE = 1;
