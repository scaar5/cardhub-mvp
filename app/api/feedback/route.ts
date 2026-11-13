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

  const base = "external_id,title,price,market_value,url,card_id,parallel,ref_source,ref_sample,ref_level,feedback,feedback_at";
  let { data, error }: { data: unknown[] | null; error: { message: string } | null } = await db
    .from("deals")
    .select(`${base},fb_card,fb_ref`)
    .or(`feedback_at.gte.${since},fb_card.not.is.null`)
    .order("feedback_at", { ascending: false, nullsFirst: false })
    .limit(500);
  if (error && /fb_card|fb_ref/.test(error.message)) {
    // Sin migración 009
    ({ data, error } = await db
      .from("deals")
      .select(base)
      .not("feedback", "is", null)
      .gte("feedback_at", since)
      .order("feedback_at", { ascending: false })
      .limit(500));
  }
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  type Row = { ref_source?: string | null; card_id: string | null; parallel: string | null; feedback: string | null; fb_card?: string | null; fb_ref?: string | null; title: string; price: number; market_value: number };
  const all = ((data ?? []) as unknown as Row[]).map((d) => {
    const card = d.card_id ? cardById.get(d.card_id) : undefined;
    return { ...d, card: card ? cardLabel(card, d.parallel) : null };
  });
  const rows = all.filter((r) => r.feedback);
  const good = rows.filter((r) => r.feedback === "bueno").length;
  // Respuestas de las dos preguntas (alertas desde el paso 33)
  const count = (key: "fb_card" | "fb_ref") =>
    all.reduce<Record<string, number>>((m, r) => {
      const v = r[key];
      if (v) m[v] = (m[v] ?? 0) + 1;
      return m;
    }, {});
  const inflated = all.filter((r) => r.fb_ref === "alta");
  // Precisión según de dónde sale la referencia (ventas reales / eBay / anuncios abiertos de Vinted)
  const bySource: Record<string, { votes: number; good: number; precision_pct: number }> = {};
  for (const r of rows) {
    const k = r.ref_source ?? "desconocida";
    const e = (bySource[k] ??= { votes: 0, good: 0, precision_pct: 0 });
    e.votes++;
    if (r.feedback === "bueno") e.good++;
  }
  for (const e of Object.values(bySource)) e.precision_pct = Math.round((e.good / e.votes) * 100);
  return NextResponse.json({
    ok: true,
    days,
    votes: rows.length,
    good,
    bad: rows.length - good,
    precision_pct: rows.length ? Math.round((good / rows.length) * 100) : null,
    por_fuente: bySource,
    // ¿Es la carta?  si / otra (paralela o carta equivocada) / lote (lote, graduada, dañada)
    carta: count("fb_card"),
    // ¿Qué dice 130point?  ok / alta (referencia inflada) / baja (vale más) / nose (sin ventas)
    referencia: count("fb_ref"),
    referencia_inflada: inflated.map((r) => ({ title: r.title, price: r.price, ref: r.market_value, card: r.card })),
    carta_equivocada: all.filter((r) => r.fb_card === "otra" || r.fb_card === "lote"),
    falsos: rows.filter((r) => r.feedback === "falso"),
    buenos: rows.filter((r) => r.feedback === "bueno").map((r) => ({ title: r.title, price: r.price, ref: r.market_value, card: r.card })),
  });
}
