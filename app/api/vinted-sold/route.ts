import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { MIN_PRICE, TRACK_MIN_PRICE } from "@/lib/config";
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
 *                                         SOLO los de ≥ TRACK_MIN_PRICE € (5 € desde el 13-nov; antes 10 €),
 *                                         primero los que hace más tiempo que no se miran (checked_at, migración 007)
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
const RECHECK_HOURS = 24; // medido 13-nov: la rotación acierta 1 de cada ~2.800 revisiones; los desaparecidos (missing) 3 de 53
// Repaso completo (vinted-sweep, ~85 min por vuelta): un anuncio que no se ha visto en las búsquedas desde hace
// GONE_HOURS probablemente se ha vendido o borrado → se revisa ANTES que los demás.
const GONE_HOURS = 3;

// `vinted` = anuncio reconocido como carta del catálogo · `vinted_x` = parece una carta de fútbol pero no se reconoce (se
// guarda igualmente para registrar su venta y reconocerla más adelante: /api/reclassify).
const OPEN_PLATFORMS = ["vinted", "vinted_x"];
const SOLD_PLATFORMS = ["vinted_sold", "vinted_x_sold"];
const CLOSED_PLATFORMS = ["vinted_sold", "vinted_gone", "vinted_x_sold", "vinted_x_gone"];

const vid = (externalId: string) => externalId.split(":")[1];

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "Falta SUPABASE_SECRET_KEY" }, { status: 503 });

  const limitParam = Number(new URL(req.url).searchParams.get("limit"));
  const batch = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(MAX_BATCH, Math.floor(limitParam)) : CHECK_BATCH;

  // Reparto entre trabajos paralelos: ?shards=M&shard=N → solo los anuncios con id % M === N
  const sp = new URL(req.url).searchParams;
  const shardsN = Math.floor(Number(sp.get("shards")));
  const shardN = Math.floor(Number(sp.get("shard")));
  const sharded = Number.isFinite(shardsN) && shardsN > 1 && Number.isFinite(shardN) && shardN >= 0 && shardN < shardsN;
  const inShard = (id: string) => {
  if (!sharded) return true;
  const n = Number(id);
  return Number.isFinite(n) ? n % shardsN === shardN : false;
  };

  const since = new Date(Date.now() - TRACK_DAYS * 86400_000).toISOString();
  type OpenRow = { external_id: string; platform: string; price: number; checked_at?: string | null; seen_at?: string | null };
  const openQuery = (cols: string) =>
    fetchAll<OpenRow>(
      (from, to) =>
        db
          .from("listings")
          .select(cols)
          .in("platform", OPEN_PLATFORMS)
          .gte("seen_at", since)
          .order("external_id")
          .range(from, to) as unknown as PromiseLike<{ data: OpenRow[] | null; error: { message: string } | null }>,
    );
  const [openFirst, closed, noPhoto] = await Promise.all([
    openQuery("external_id,platform,price,checked_at,seen_at"),
    fetchAll<{ external_id: string }>((from, to) =>
      db
        .from("listings")
        .select("external_id")
        .in("platform", CLOSED_PLATFORMS)
        .order("external_id")
        .range(from, to),
    ),
    db
      .from("listings")
      .select("external_id")
      .in("platform", SOLD_PLATFORMS)
      .is("photo_path", null)
      .order("seen_at", { ascending: false })
      .limit(PHOTO_BATCH),
  ]);
  // Sin la migración 007 todavía no hay checked_at: se sigue como antes (al azar)
  const open = openFirst.error ? await openQuery("external_id,platform,price") : openFirst;
  if (open.error || closed.error) {
    return NextResponse.json({ ok: false, error: open.error?.message ?? closed.error?.message }, { status: 500 });
  }
  const done = new Set(closed.data.map((r) => vid(r.external_id)));
  // Un anuncio puede estar como `vinted` y como `vinted_x` (si luego se reconoció): cuenta una sola vez, gana `vinted`
  type Row = { id: string; price: number; checked: number; seen: number; recognized: boolean };
  const byId = new Map<string, Row>();
  for (const r of open.data) {
    const id = vid(r.external_id);
    if (!id || done.has(id) || !inShard(id)) continue;
    const row: Row = {
      id,
      price: Number(r.price),
      checked: r.checked_at ? Date.parse(r.checked_at) : 0, // nunca revisado → el primero
      seen: r.seen_at ? Date.parse(r.seen_at) : 0,
      recognized: r.platform === "vinted",
    };
    const prev = byId.get(id);
    if (!prev || (row.recognized && !prev.recognized)) byId.set(id, row);
  }
  const pending = [...byId.values()];
  const cheap = pending.filter((r) => !(r.price >= TRACK_MIN_PRICE)).length;
  // Solo se revisan los de TRACK_MIN_PRICE € o más (5 €): los más baratos se guardan, pero no se gasta Vinted en ellos
  const all = pending.filter((r) => r.price >= TRACK_MIN_PRICE);
  // Rotación lenta: solo los reconocidos. Los `vinted_x` se revisan únicamente cuando desaparecen de las búsquedas.
  const tracked = all.filter((r) => r.recognized);
  // Al azar entre iguales, y luego por turno: el que lleva más tiempo sin mirarse va antes
  for (let i = tracked.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tracked[i], tracked[j]] = [tracked[j], tracked[i]];
  }
  tracked.sort((a, b) => a.checked - b.checked);
  const recent = Date.now() - RECHECK_HOURS * 3600_000;
  const due = tracked.filter((r) => r.checked < recent);
  // Desaparecidos: no se ven en las búsquedas desde hace GONE_HOURS y no se han revisado desde entonces
  const goneLine = Date.now() - GONE_HOURS * 3600_000;
  const isMissing = (r: { seen: number; checked: number }) => r.seen && r.seen < goneLine && r.checked < r.seen + GONE_HOURS * 3600_000;
  const missing = all.filter(isMissing).sort((a, b) => b.seen - a.seen); // los que acaban de desaparecer, primero
  const missingSet = new Set(missing.map((r) => r.id));
  const ordered = [...missing.map((r) => r.id), ...due.filter((r) => !missingSet.has(r.id)).map((r) => r.id)];
  // Cuánto se tarda en dar la vuelta: el revisado hace más tiempo (horas), sin contar los nunca revisados
  const oldest = tracked.find((r) => r.checked);
  return NextResponse.json({
    ok: true,
    open: tracked.length,
    open_10: tracked.length,
    open_x: all.length - tracked.length,
    skipped_cheap: cheap,
    due: due.length,
    missing: missing.length,
    missing_x: missing.filter((r) => !r.recognized).length,
    n_missing_in_batch: Math.min(missing.length, batch),
    never_checked: tracked.filter((r) => !r.checked).length,
    oldest_10_hours: oldest ? Math.round((Date.now() - oldest.checked) / 3600_000) : null,
    ids: ordered.slice(0, batch),
    // Si la migración 006 no está, no hay columna photo_path: se sigue sin fotos
    photo_ids: noPhoto.error ? [] : (noPhoto.data ?? []).map((r) => vid(r.external_id)).filter(inShard),
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
  const okIds = (body?.results ?? []).filter((r) => r && r.id).map((r) => r.id);
  // El mismo id puede estar guardado como reconocido (`vinted:`) o como no reconocido (`vinted_x:`)
  const checkedIds = okIds.flatMap((id) => [`vinted:${id}`, `vinted_x:${id}`]);
  const closed = (body?.results ?? []).filter((r) => r && r.id && (r.state === "sold" || r.state === "gone"));
  const photos = (body?.photos ?? []).filter((p) => p && p.id && (p.url || p.data)).slice(0, 20);

  // Apuntar cuándo se ha mirado cada anuncio (para revisar por turnos)
  let checked = 0;
  if (checkedIds.length) {
    const now = new Date().toISOString();
    const { error, count } = await db
      .from("listings")
      .update({ checked_at: now }, { count: "exact" })
      .in("external_id", checkedIds.slice(0, 1000));
    if (!error) checked = count ?? 0;
  }
  if (closed.length === 0 && photos.length === 0)
    return NextResponse.json({ ok: true, checked, sold: 0, gone: 0, photos: 0 });

  const { data, error } = closed.length
    ? await db
        .from("listings")
        .select("external_id,platform,card_id,parallel,title,price,url")
        .in("external_id", closed.flatMap((r) => [`vinted:${r.id}`, `vinted_x:${r.id}`]))
    : { data: [], error: null };
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  // Si está de las dos formas, gana el reconocido
  const byId = new Map<string, NonNullable<typeof data>[number]>();
  for (const l of data ?? []) {
    const id = vid(l.external_id);
    if (!byId.has(id) || l.platform === "vinted") byId.set(id, l);
  }

  const now = new Date().toISOString();
  const rows = [];
  for (const r of closed) {
    const l = byId.get(r.id);
    if (!l) continue;
    const price = r.state === "sold" && Number.isFinite(r.price) && r.price! >= MIN_PRICE ? r.price! : Number(l.price);
    const platform = l.platform === "vinted_x" ? `vinted_x_${r.state}` : `vinted_${r.state}`;
    rows.push({
      external_id: `${platform}:${r.id}`,
      card_id: l.card_id,
      parallel: l.parallel,
      platform,
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
    sold_x: rows.filter((r) => r.platform === "vinted_x_sold").length,
    gone_x: rows.filter((r) => r.platform === "vinted_x_gone").length,
    photos: photoOk,
    ...(photoErrors.length ? { photo_errors: photoErrors } : {}),
  });
}
