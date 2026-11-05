import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente de Supabase con permiso de escritura. SOLO para código de servidor.
 * Usa SUPABASE_SECRET_KEY (sb_secret_...) — nunca la pongas en una variable NEXT_PUBLIC_.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
