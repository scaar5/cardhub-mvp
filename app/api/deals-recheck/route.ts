import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { judgeDeal } from "@/lib/deals";
import { recognize } from "@/lib/recognize";
import { candidateCardIds, loadReferences, resolveReference } from "@/lib/reference";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/deals-recheck[?apply=1]   (cabecera x-alert-secret)
 * Vuelve a juzgar los chollos guardados con las reglas y referencias de HOY
 * (reconocedor, mínimo de anuncios, valor mínimo, descuentos extremos…).
 * Sin apply=1 solo enseña qué haría. Con apply=1 borra los que ya no son chollo
 * y actualiza la referencia de los que siguen. Los que ya votaste en Telegram no se tocan.
 */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "Falta SUPABASE_SECRET_KEY" }, { status: 503 });
  const apply = new URL(req.url).searchParams.get("apply") === "1";

  const { data, error } = await db.from("deals").select("id,external_id,title,platform,price,market_value,feedback").limit(5000);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const deals = (data ?? []).filter((d) => !d.feedback);
  const recognized = deals.map((d) => ({ d, match: d.platform === "ebay" ? null : recognize(d.title).match }));
  const refs = await loadReferences(
    db,
    candidateCardIds(recognized.flatMap((r) => (r.match && r.match.confidence === "alta" ? [r.match.card] : []))),
  );

  const remove: { id: number; title: string; price: number; old_ref: number; why: string }[] = [];
  const keep: { id: number; title: string; price: number; ref: number; pct: number; source: string; sample: number }[] = [];
  const updates: { id: number; row: Record<string, unknown> }[] = [];
  for (const { d, match } of recognized) {
    const base = { id: d.id, title: d.title, price: Number(d.price) };
    if (d.platform === "ebay") {
      remove.push({ ...base, old_ref: Number(d.market_value), why: "chollo de eBay (eBay ya solo es referencia)" });
      continue;
    }
    if (!match || match.confidence !== "alta") {
      remove.push({ ...base, old_ref: Number(d.market_value), why: "la carta ya no se reconoce con seguridad" });
      continue;
    }
    const ref = resolveReference(refs, match.card, match.parallel);
    const verdict = judgeDeal(Number(d.price), ref);
    if (!("pct" in verdict)) {
      remove.push({ ...base, old_ref: Number(d.market_value), why: verdict.reject });
      continue;
    }
    keep.push({ ...base, ref: ref!.value, pct: verdict.pct, source: ref!.source, sample: ref!.sample });
    updates.push({
      id: d.id,
      row: {
        market_value: ref!.value,
        card_id: match.card.id,
        parallel: match.parallel,
        ref_source: ref!.source,
        ref_sample: ref!.sample,
        ref_level: ref!.level,
      },
    });
  }

  if (apply) {
    const ids = remove.map((r) => r.id);
    for (let i = 0; i < ids.length; i += 200) {
      const { error: e } = await db.from("deals").delete().in("id", ids.slice(i, i + 200));
      if (e) return NextResponse.json({ ok: false, error: `borrar: ${e.message}` }, { status: 500 });
    }
    for (const u of updates) {
      const { error: e } = await db.from("deals").update(u.row).eq("id", u.id);
      if (e) return NextResponse.json({ ok: false, error: `actualizar: ${e.message}` }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    applied: apply,
    total: data?.length ?? 0,
    voted_untouched: (data?.length ?? 0) - deals.length,
    removed: remove.length,
    kept: keep.length,
    remove,
    keep,
  });
}
