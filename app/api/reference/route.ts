import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { CARDS } from "@/lib/catalog";
import { candidateCardIds, loadReferences, resolveReference } from "@/lib/reference";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/reference?card=<card_id>&parallel=<variante>   (cabecera x-alert-secret)
 * Explica un precio de referencia: qué referencia sale y con qué anuncios/ventas se calcula.
 * Lo usa el workflow reference-check.yml para revisar chollos raros.
 */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "Falta SUPABASE_SECRET_KEY" }, { status: 503 });
  const u = new URL(req.url);
  const card = CARDS.find((c) => c.id === u.searchParams.get("card"));
  if (!card) return NextResponse.json({ ok: false, error: "Carta no encontrada" }, { status: 404 });
  const parallel = u.searchParams.get("parallel") || null;

  const refs = await loadReferences(db, candidateCardIds([card]));
  const resolved = resolveReference(refs, card, parallel);
  const { data, error } = await db
    .from("listings")
    .select("platform,parallel,price,title,url,seen_at")
    .eq("card_id", card.id)
    .in("platform", ["ebay", "vinted_sold"])
    .order("price")
    .limit(100);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, card, parallel, resolved, refs_for_card: refs.get(card.id) ?? [], listings: data });
}
