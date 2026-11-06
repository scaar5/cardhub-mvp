import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { CARDS } from "@/lib/catalog";
import { cardLabel } from "@/lib/reference";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const cardById = new Map(CARDS.map((c) => [c.id, c]));

/**
 * GET /api/feedback[?days=30]   (cabecera x-alert-secret)
 * Resumen de tus votos de Telegram: % de alertas buenas y la lista de las marcadas como falsas
 * (con la carta reconocida y la referencia usada) para revisar qué falló.
 */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "Falta SUPABASE_SECRET_KEY" }, { status: 503 });
  const days = Number(new URL(req.url).searchParams.get("days") ?? 30);
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  const { data, error } = await db
    .from("deals")
    .select("external_id,title,price,market_value,url,card_id,parallel,ref_source,ref_sample,ref_level,feedback,feedback_at")
    .not("feedback", "is", null)
    .gte("feedback_at", since)
    .order("feedback_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const rows = (data ?? []).map((d) => {
    const card = d.card_id ? cardById.get(d.card_id) : undefined;
    return { ...d, card: card ? cardLabel(card, d.parallel) : null };
  });
  const good = rows.filter((r) => r.feedback === "bueno").length;
  return NextResponse.json({
    ok: true,
    days,
    votes: rows.length,
    good,
    bad: rows.length - good,
    precision_pct: rows.length ? Math.round((good / rows.length) * 100) : null,
    falsos: rows.filter((r) => r.feedback === "falso"),
    buenos: rows.filter((r) => r.feedback === "bueno").map((r) => ({ title: r.title, price: r.price, ref: r.market_value, card: r.card })),
  });
}
