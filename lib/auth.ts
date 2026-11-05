/** Comprueba la cabecera x-alert-secret contra ALERT_SECRET. */
export function authorized(req: Request): boolean {
  const secret = process.env.ALERT_SECRET;
  return Boolean(secret) && req.headers.get("x-alert-secret") === secret;
}
