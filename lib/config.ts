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

/** Nº mínimo de anuncios de eBay de la misma carta y variante para fiarse de la referencia. */
export const MIN_REF_SAMPLE = 3;

/** Días de anuncios de eBay que cuentan para la referencia. */
export const REF_DAYS = 45;

/** Precio mínimo (€): descarta anuncios trampa de 0,01 €. */
export const MIN_PRICE = 0.5;

/** Para el valorador manual (/valorar): nº mínimo de comparables de una búsqueda libre. */
export const MIN_SAMPLE = 8;
