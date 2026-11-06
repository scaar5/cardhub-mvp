import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { MIN_PRICE } from "@/lib/config";
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
 * GET  /api/vinted-sold (x-alert-secret) → anuncios abiertos que toca revisar (máx. CHECK_BATCH, al azar)
 * POST /api/vinted-sold (x-alert-secret) → { results: [{ id, state: "sold"|"gone"|"open"|"reserved", price? }] }
 *
 * La lectura de Vinted la hace el workflow de GitHub (scripts/vinted-sold-check.mjs).
 */
const CHECK_BATCH = 60;
const TRACK_DAYS = 30;

const vid = (externalId: string) => externalId.split(":")[1];

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "Falta SUPABASE_SECRET_KEY" }, { status: 503 });

  const since = new Date(Date.now() - TRACK_DAYS * 86400_000).toISOString();
  const [open, closed] = await Promise.all([
    db.from("listings").select("external_id").eq("platform", "vinted").gte("seen_at", since).limit(10000),
    db.from("listings").select("external_id").in("platform", ["vinted_sold", "vinted_gone"]).limit(20000),
  ]);
  if (open.error || closed.error) {
    return NextResponse.json({ ok: false, error: open.error?.message ?? closed.error?.message }, { status: 500 });
  }
  const done = new Set((closed.data ?? []).map((r) => vid(r.external_id)));
  const pending = (open.data ?? []).map((r) => vid(r.external_id)).filter((id) => id && !done.has(id));
  // Al azar: así, pasada a pasada, se acaban revisando todos
  for (let i = pending.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pending[i], pending[j]] = [pending[j], pending[i]];
  }
  return NextResponse.json({ ok: true, open: pending.length, ids: pending.slice(0, CHECK_BATCH) });
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

  const body = (await req.json().catch(() => null)) as { results?: InResult[] } | null;
  const closed = (body?.results ?? []).filter((r) => r && r.id && (r.state === "sold" || r.state === "gone"));
  if (closed.length === 0) return NextResponse.json({ ok: true, sold: 0, gone: 0 });

  const { data, error } = await db
    .from("listings")
    .select("external_id,card_id,parallel,title,price,url")
    .in("external_id", closed.map((r) => `vinted:${r.id}`));
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
  return NextResponse.json({
    ok: true,
    sold: rows.filter((r) => r.platform === "vinted_sold").length,
    gone: rows.filter((r) => r.platform === "vinted_gone").length,
  });
}
