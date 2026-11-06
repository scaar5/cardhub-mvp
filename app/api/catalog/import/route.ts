import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { CARDS, SETS } from "@/lib/catalog";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/catalog/import   (cabecera x-alert-secret: <ALERT_SECRET>)
 * Copia el catálogo (lib/catalog-data.json) a las tablas sets y cards de Supabase.
 * Se puede repetir sin problema: actualiza lo que ya existe.
 * Requiere haber ejecutado supabase/migrations/003_catalogo.sql.
 */
export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }
  const db = getSupabaseAdmin();
  if (!db) {
    return NextResponse.json({ ok: false, error: "Falta SUPABASE_SECRET_KEY" }, { status: 503 });
  }

  const { error: setsError } = await db
    .from("sets")
    .upsert(SETS.map((s) => ({ ...s, updated_at: new Date().toISOString() })), { onConflict: "slug" });
  if (setsError) {
    const missingTable =
      setsError.code === "42P01" ||
      setsError.code === "PGRST205" ||
      /does not exist|could not find the table/i.test(setsError.message);
    if (missingTable) {
      // Aún no se ha ejecutado la migración: no es un fallo, simplemente no hay dónde importar.
      return NextResponse.json({
        ok: true,
        skipped: "Faltan las tablas: ejecuta supabase/migrations/003_catalogo.sql en Supabase",
      });
    }
    return NextResponse.json({ ok: false, error: setsError.message }, { status: 500 });
  }

  const CHUNK = 500;
  for (let i = 0; i < CARDS.length; i += CHUNK) {
    const { error } = await db.from("cards").upsert(CARDS.slice(i, i + CHUNK), { onConflict: "id" });
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message, imported: i },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ ok: true, sets: SETS.length, cards: CARDS.length });
}
