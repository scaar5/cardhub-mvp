import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";

/**
 * Fotos de las ventas: miniatura propia en Supabase Storage (bucket "ventas").
 * WebP de máx. 400 px (~20–30 KB): 1 GB gratis da para ~30.000 fotos.
 */
import { PHOTO_BUCKET } from "./photo-url";

export { PHOTO_BUCKET };
const MAX_SIDE = 400;
const MAX_INPUT = 3_000_000;

export interface InPhoto {
  id: string;
  url?: string;
  /** Imagen ya descargada por el workflow (base64). Si falta, se descarga desde `url`. */
  data?: string;
}

const isVintedImage = (u: string) => {
  try {
    const { protocol, hostname } = new URL(u);
    return protocol === "https:" && /(^|\.)vinted\.net$/.test(hostname);
  } catch {
    return false;
  }
};

async function download(url: string): Promise<Buffer> {
  if (!isVintedImage(url)) throw new Error("URL de foto no válida");
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`descarga ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Hace la miniatura, la sube a Storage y la apunta en la venta (`vinted_sold:<id>`). */
export async function storeSalePhoto(db: SupabaseClient, p: InPhoto): Promise<string> {
  if (!/^\d+$/.test(p.id)) throw new Error("id no válido");
  const src = p.data ? Buffer.from(p.data, "base64") : p.url ? await download(p.url) : null;
  if (!src || src.length === 0) throw new Error("sin imagen");
  if (src.length > MAX_INPUT) throw new Error("imagen demasiado grande");

  const thumb = await sharp(src)
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 72 })
    .toBuffer();

  const path = `vinted/${p.id}.webp`;
  const up = await db.storage
    .from(PHOTO_BUCKET)
    .upload(path, thumb, { contentType: "image/webp", upsert: true, cacheControl: "31536000" });
  if (up.error) throw new Error(`storage: ${up.error.message}`);

  const { error } = await db
    .from("listings")
    .update({ photo_path: path, photo_url: p.url && isVintedImage(p.url) ? p.url : null })
    .eq("external_id", `vinted_sold:${p.id}`);
  if (error) throw new Error(`listings: ${error.message}`);
  return path;
}
