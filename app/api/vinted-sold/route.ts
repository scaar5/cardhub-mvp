import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { MIN_PRICE, MIN_REF_VALUE } from "@/lib/config";
import { fetchAll } from "@/lib/fetch-all";
import { storeSalePhoto, type InPhoto } from "@/lib/photos";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Seguimiento de VENTAS en Vinted (sin migraciones: todo va en `listings` con otra plataforma).
 *
 *   platform = "vinted"       → anuncio reconocido (lo guarda /api/vinted)
 *   platform = "vinted_sold"  → ese anuncio se ha VENDIDO   (external_id "vinted_sold:<id>", seen_at ≈ fecha de venta)
 *   platform = "vinted_gone"  → ese anuncio ha DESAPARECIDO (borrado por el vendedor: no cuenta como venta)
 *
 * GET  /api/vinted-sold[?limit=N] (x-alert-secret) → anuncios abiertos que toca revisar (máx. N o CHECK_BATCH;
 *                                         no se repiten los mirados hace menos de RECHECK_HOURS):
 *                                         primero los de ≥ MIN_REF_VALUE €, y dentro de ellos los que hace
 *                                         más tiempo que no se miran (checked_at, migración 007)
 *                                         + photo_ids: ventas sin foto todavía (máx. PHOTO_BATCH)
 * POST /api/vinted-sold (x-alert-secret) → { results: [{ id, state: "sold"|"gone"|"open"|"reserved", price? }],
 *                                            photos?: [{ id, url, data? }] }  (foto de cada venta → Supabase Storage)
 *
 * La lectura de Vinted la hace el workflow de GitHub (scripts/vinted-sold-check.mjs).
 */
const CHECK_BATCH = 75;
const MAX_BATCH = 200;
const TRACK_DAYS = 30;
const PHOTO_BATCH = 10;
// En modo continuo no se vuelve a mirar un anuncio hasta pasadas unas horas (si no, se repetirían siempre los mismos)
const RECHECK_HOURS = 3;

const vid = (externalId: string) => externalId.split(":")[1];

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "Falta SUPABASE_SECRET_KEY" }, { status: 503 });

  const limitParam = Number(new URL(req.url).searchParams.get("limit"));
  const batch = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(MAX_BATCH, Math.floor(limitParam)) : CHECK_BATCH;

  const since = new Date(Date.now() - TRACK_DAYS * 86400_000).toISOString();
  type OpenRow = { external_id: string; price: number; checked_at?: string | null };
  const openQuery = (cols: string) =>
    fetchAll<OpenRow>(
      (from, to) =>
        db
          .from("listings")
          .select(cols)
          .eq("platform", "vinted")
          .gte("seen_at", since)
          .order("external_id")
          .range(from, to) as unknown as PromiseLike<{ data: OpenRow[] | null; error: { message: string } | null }>,
    );
  const [openFirst, closed, noPhoto] = await Promise.all([
    openQuery("external_id,price,checked_at"),
    fetchAll<{ external_id: string }>((from, to) =>
      db
        .from("listings")
        .select("external_id")
        .in("platform", ["vinted_sold", "vinted_gone"])
        .order("external_id")
        .range(from, to),
    ),
    db
      .from("listings")
      .select("external_id")
      .eq("platform", "vinted_sold")
      .is("photo_path", null)
      .order("seen_at", { ascending: false })
      .limit(PHOTO_BATCH),
  ]);
  // Sin la migración 007 todavía no hay checked_at: se sigue como antes (al azar)
  const open = openFirst.error ? await openQuery("external_id,price") : openFirst;
  if (open.error || closed.error) {
    return NextResponse.json({ ok: false, error: open.error?.message ?? closed.error?.message }, { status: 500 });
  }
  const done = new Set(closed.data.map((r) => vid(r.external_id)));
  const pending = open.data
    .map((r) => ({
      id: vid(r.external_id),
      price: Number(r.price),
      checked: r.checked_at ? Date.parse(r.checked_at) : 0, // nunca revisado → el primero
    }))
    .filter((r) => r.id && !done.has(r.id));
  // Al azar entre iguales, y luego por turno: el que lleva más tiempo sin mirarse va antes
  for (let i = pending.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pending[i], pending[j]] = [pending[j], pending[i]];
  }
  pending.sort((a, b) => a.checked - b.checked);
  const recent = Date.now() - RECHECK_HOURS * 3600_000;
  const due = pending.filter((r) => r.checked < recent);
  // Primero los de MIN_REF_VALUE € o más (los baratos no interesan); los baratos solo rellenan huecos
  const ordered = [
    ...due.filter((r) => r.price >= MIN_REF_VALUE),
    ...due.filter((r) => !(r.price >= MIN_REF_VALUE)),
  ].map((r) => r.id);
  const important = pending.filter((r) => r.price >= MIN_REF_VALUE).length;
  // Cuánto se tarda en dar la vuelta: el más antiguo de los de ≥10 € (horas desde que se miró)
  const oldest10 = pending.find((r) => r.price >= MIN_REF_VALUE);
  return NextResponse.json({
    ok: true,
    open: pending.length,
    open_10: important,
    due: due.length,
    never_checked: pending.filter((r) => !r.checked).length,
    oldest_10_hours: oldest10?.checked ? Math.round((Date.now() - oldest10.checked) / 3600_000) : null,
    ids: ordered.slice(0, batch),
    // Si la migración 006 no está, no hay columna photo_path: se sigue sin fotos
    photo_ids: noPhoto.error ? [] : (noPhoto.data ?? []).map((r) => vid(r.external_id)),
  });
}

interface InResult {
  id: string;
  state: "sold" | "gone" | "open" | "reserved";
  price?: number;
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "Falta SUPABASE_SECRET_KEY" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { results?: InResult[]; photos?: InPhoto[] } | null;
  const checkedIds = (body?.results ?? []).filter((r) => r && r.id).map((r) => `vinted:${r.id}`);
  const closed = (body?.results ?? []).filter((r) => r && r.id && (r.state === "sold" || r.state === "gone"));
  const photos = (body?.photos ?? []).filter((p) => p && p.id && (p.url || p.data)).slice(0, 20);

  // Apuntar cuándo se ha mirado cada anuncio (para revisar por turnos)
  let checked = 0;
  if (checkedIds.length) {
    const now = new Date().toISOString();
    const { error, count } = await db
      .from("listings")
      .update({ checked_at: now }, { count: "exact" })
      .in("external_id", checkedIds.slice(0, 500));
    if (!error) checked = count ?? 0;
  }
  if (closed.length === 0 && photos.length === 0)
    return NextResponse.json({ ok: true, checked, sold: 0, gone: 0, photos: 0 });

  const { data, error } = closed.length
    ? await db
        .from("listings")
        .select("external_id,card_id,parallel,title,price,url")
        .in("external_id", closed.map((r) => `vinted:${r.id}`))
    : { data: [], error: null };
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const byId = new Map((data ?? []).map((l) => [vid(l.external_id), l]));

  const now = new Date().toISOString();
  const rows = [];
  for (const r of closed) {
    const l = byId.get(r.id);
    if (!l) continue;
    const price = r.state === "sold" && Number.isFinite(r.price) && r.price! >= MIN_PRICE ? r.price! : Number(l.price);
    rows.push({
      external_id: `vinted_${r.state}:${r.id}`,
      card_id: l.card_id,
      parallel: l.parallel,
      platform: `vinted_${r.state}`,
      title: l.title,
      price,
      url: l.url,
      seen_at: now,
    });
  }
  if (rows.length) {
    const { error: e2 } = await db.from("listings").upsert(rows, { onConflict: "external_id" });
    if (e2) return NextResponse.json({ ok: false, error: e2.message }, { status: 500 });
  }

  // Fotos de las ventas (después de guardar la venta, para poder apuntarla)
  let photoOk = 0;
  const photoErrors: string[] = [];
  for (const p of photos) {
    try {
      await storeSalePhoto(db, p);
      photoOk++;
    } catch (e) {
      photoErrors.push(`${p.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({
    ok: true,
    checked,
    sold: rows.filter((r) => r.platform === "vinted_sold").length,
    gone: rows.filter((r) => r.platform === "vinted_gone").length,
    photos: photoOk,
    ...(photoErrors.length ? { photo_errors: photoErrors } : {}),
  });
}
