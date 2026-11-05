/** Comprueba la cabecera x-alert-secret contra ALERT_SECRET (ignorando espacios y saltos de línea en los extremos). */
export function authorized(req: Request): boolean {
  const secret = process.env.ALERT_SECRET?.trim();
  const given = req.headers.get("x-alert-secret")?.trim();
  return Boolean(secret) && given === secret;
}
