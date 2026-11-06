/**
 * Umbrales del sniper. Las búsquedas de cada colección están en lib/set-rules.ts.
 *
 * Cómo funciona:
 *   - eBay = referencia. Cada anuncio de eBay que se reconoce se guarda en `listings`
 *     enlazado a su carta y variante. El precio de referencia de una carta es la
 *     mediana de sus anuncios de eBay de los últimos REF_DAYS días.
 *   - Vinted = chollos. Cada anuncio nuevo de Vinted se reconoce y se compara con
 *     el precio de referencia de ESA carta y ESA variante.
 */

/** Descuento mínimo (%) frente a la referencia para guardar un anuncio de Vinted como chollo. */
export const SAVE_THRESHOLD = 25;

/** Descuento mínimo (%) para mandar alerta por Telegram. */
export const ALERT_THRESHOLD = 35;

/** Nº mínimo de VENTAS reales de Vinted de la misma carta y variante para fiarse de la referencia. */
export const MIN_REF_SAMPLE = 2;

/**
 * Nº mínimo de ANUNCIOS de eBay (precios pedidos) para fiarse de la referencia.
 * Con 2 no basta: en cartas baratas hay vendedores que piden 10× lo que valen.
 */
export const EBAY_MIN_SAMPLE = 3;

/**
 * Descuentos extremos (≥ este %) con referencia de eBay: solo cuentan si la referencia se apoya en
 * al menos EXTREME_MIN_SAMPLE anuncios. Un -80 % real es rarísimo; casi siempre es una referencia inflada.
 */
export const EXTREME_PCT = 70;
export const EXTREME_MIN_SAMPLE = 6;

/** A partir de cuántos anuncios se usa el percentil 25 (eBay: precios pedidos, tiran al alza); por debajo, el más bajo. */
export const RELIABLE_SAMPLE = 4;

/** Días de ventas reales de Vinted que cuentan para la referencia. */
export const SOLD_DAYS = 90;

/** Días de anuncios de eBay que cuentan para la referencia. */
export const REF_DAYS = 45;

/** Precio mínimo (€): descarta anuncios trampa de 0,01 €. */
export const MIN_PRICE = 0.5;

/** Para el valorador manual (/valorar): nº mínimo de comparables de una búsqueda libre. */
export const MIN_SAMPLE = 8;
