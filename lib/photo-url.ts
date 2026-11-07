/** Bucket de Supabase Storage con las miniaturas de las ventas. */
export const PHOTO_BUCKET = "ventas";

/** URL pública de una foto guardada (sin dependencias de servidor: se puede usar en páginas). */
export function photoPublicUrl(path: string | null | undefined): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!path || !base) return null;
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/${PHOTO_BUCKET}/${path}`;
}
