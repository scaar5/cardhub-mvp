import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { fetchAll } from "@/lib/fetch-all";
import { recognize } from "@/lib/recognize";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/reclassify[?apply=1][&limit=N]   (cabecera x-alert-secret)
 *
 * Los anuncios que parecen una carta de fútbol pero no se reconocieron se guardan como `vinted_x` (y, si se venden,
 * `vinted_x_sold` / `vinted_x_gone`). Cuando el catálogo o el reconocedor mejoran, esto los vuelve a pasar:
 * los que ahora se reconocen con confianza alta pasan a `vinted` / `vinted_sold` / `vinted_gone` con su carta.
 *
 * Sin `apply` solo cuenta (no toca nada). Primero las ventas, luego bajas, luego los abiertos.
 */
const MAP: Record<string, string> = {
  vinted_x_sold: "vinted_sold",
  vinted_x_gone: "vinted_gone",
  vinted_x: "vinted",
};

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "Falta SUPABASE_SECRET_KEY" }, { status: 503 });

  const sp = new URL(req.url).searchParams;
  const apply = sp.get("apply") === "1";
  const limit = Math.min(20000, Math.max(1, Math.floor(Number(sp.get("limit") ?? 6000))));

  type Row = { external_id: string; platform: string; title: string };
  const rows: Row[] = [];
  for (const platform of ["vinted_x_sold", "vinted_x_gone", "vinted_x"]) {
    if (rows.length >= limit) break;
    const { data, error } = await fetchAll<Row>(
      (from, to) =>
        db
          .from("listings")
          .select("external_id,platform,title")
          .eq("platform", platform)
          .order("external_id")
          .range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
      limit - rows.length,
    );
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    rows.push(...data);
  }

  const found = rows
    .map((r) => ({ r, match: recognize(r.title).match }))
    .filter((x) => x.match && x.match.confidence === "alta");
  const byPlatform: Record<string, { checked: number; recognized: number }> = {};
  for (const r of rows) (byPlatform[r.platform] ??= { checked: 0, recognized: 0 }).checked++;
  for (const { r } of found) byPlatform[r.platform].recognized++;

  let moved = 0;
  let skipped = 0;
  // Un UPDATE por fila: se limita por llamada para no pasar los 60 s de la función (repetir hasta que `remaining` sea 0)
  const MAX_MOVES = 500;
  const batch = found.slice(0, MAX_MOVES);
  if (apply && batch.length) {
    // Los que ya existen con el nombre nuevo (mismo id) no se tocan
    const newIds = batch.map(({ r }) => `${MAP[r.platform]}:${r.external_id.split(":")[1]}`);
    const existing = new Set<string>();
    for (let i = 0; i < newIds.length; i += 300) {
      const { data } = await db.from("listings").select("external_id").in("external_id", newIds.slice(i, i + 300));
      for (const d of data ?? []) existing.add(d.external_id);
    }
    for (const { r, match } of batch) {
      const id = r.external_id.split(":")[1];
      const newExternal = `${MAP[r.platform]}:${id}`;
      if (existing.has(newExternal)) {
        skipped++;
        continue;
      }
      const { error } = await db
        .from("listings")
        .update({
          external_id: newExternal,
          platform: MAP[r.platform],
          card_id: match!.card.id,
          parallel: match!.parallel,
        })
        .eq("external_id", r.external_id);
      if (error) skipped++;
      else moved++;
    }
  }

  return NextResponse.json({
    ok: true,
    apply,
    checked: rows.length,
    recognized_now: found.length,
    by_platform: byPlatform,
    moved,
    skipped,
    remaining: apply ? Math.max(0, found.length - batch.length) : found.length,
  });
}
