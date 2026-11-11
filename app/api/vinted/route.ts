import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { ALERT_THRESHOLD, MIN_PRICE } from "@/lib/config";
import { judgeDeal } from "@/lib/deals";
import { recognize } from "@/lib/recognize";
import { point130Query } from "@/lib/point130";
import { candidateCardIds, cardLabel, loadReferences, resolveReference } from "@/lib/reference";
import { VINTED_SEARCHES } from "@/lib/set-rules";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { dealAlertHtml, sendDealAlert } from "@/lib/telegram";
import { loadComparables } from "@/lib/valuation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/vinted   (x-alert-secret) → lista de búsquedas que hay que hacer en Vinted.
 *
 * POST /api/vinted  (x-alert-secret) → recibe los anuncios leídos de Vinted
 *   { items: [{ id, title, price, url, set }] }
 * y para cada uno:
 *   1. reconoce la carta y variante,
 *   2. lo compara con el precio de referencia de eBay de ESA carta y variante,
 *   3. guarda los que tienen ≥ SAVE_THRESHOLD % de descuento en `deals`,
 *   4. avisa por Telegram de los nuevos con ≥ ALERT_THRESHOLD %.
 *
 * Con { backfill: true } (páginas antiguas de Vinted) solo se hace el paso 1 y se guarda el anuncio en `listings`
 * para seguir si se vende: NO se guardan chollos ni se avisa (no son anuncios recién publicados).
 * Sí se cuenta cuántos lo habrían sido (`deals`), para saber si merece la pena avisar de los muy fuertes.
 *
 * La lectura de Vinted la hace el workflow de GitHub (scripts/vinted-scan.mjs).
 */
export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, searches: VINTED_SEARCHES });
}

interface InItem {
  id: string;
  title: string;
  price: number;
  url: string;
  set?: string;
  /** 1.ª foto del anuncio (de la página de resultados de Vinted). */
  photo?: string | null;
}

/** Solo fotos del CDN de Vinted (no se reenvía a Telegram cualquier URL que llegue). */
const vintedPhoto = (u: unknown) =>
  typeof u === "string" && /^https:\/\/images\d*\.vinted\.net\//.test(u) ? u : null;

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }
  const db = getSupabaseAdmin();
  if (!db) {
    return NextResponse.json({ ok: false, error: "Falta SUPABASE_SECRET_KEY" }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as { items?: InItem[]; backfill?: boolean } | null;
  const backfill = body?.backfill === true;
  const items = (body?.items ?? []).filter(
    (i) => i && i.id && i.title && Number.isFinite(i.price) && i.price >= MIN_PRICE,
  );

  // 1) Reconocer (sin repetir anuncios que salen en varias búsquedas)
  const seen = new Set<string>();
  const recognized = [];
  for (const it of items) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    const { match } = recognize(it.title, it.set);
    if (match?.confidence === "alta") recognized.push({ it, match });
  }

  // 2) Historial: guardar también los anuncios de Vinted (para analytics futuras)
  const now = new Date().toISOString();
  if (recognized.length) {
    const { error } = await db.from("listings").upsert(
      recognized.map(({ it, match }) => ({
        external_id: `vinted:${it.id}`,
        card_id: match.card.id,
        parallel: match.parallel,
        platform: "vinted",
        title: it.title,
        price: it.price,
        url: it.url,
        seen_at: now,
      })),
      { onConflict: "external_id" },
    );
    if (error) return NextResponse.json({ ok: false, error: `listings: ${error.message}` }, { status: 500 });
  }

  // 3) Comparar con la referencia de eBay
  //    En cascada: exacta → misma colección (numeración cercana). La colección hermana ya no se usa.
  const refs = await loadReferences(db, candidateCardIds(recognized.map((r) => r.match.card)));
  let withRef = 0;
  const byLevel = { exact: 0, sibling: 0, nearby: 0 };
  const deals = [];
  for (const { it, match } of recognized) {
    const ref = resolveReference(refs, match.card, match.parallel);
    if (!ref) continue;
    withRef++;
    if (ref.level === 1) byLevel.exact++;
    else if (ref.level === 2) byLevel.sibling++;
    else byLevel.nearby++;
    const verdict = judgeDeal(it.price, ref);
    if (!("pct" in verdict)) continue;
    const pct = verdict.pct;
    deals.push({
      row: {
        external_id: `vinted:${it.id}`,
        title: it.title,
        platform: "vinted",
        price: it.price,
        market_value: ref.value,
        url: it.url,
        query: it.set ?? null,
        card_id: match.card.id,
        parallel: match.parallel,
        ref_source: ref.source,
        ref_sample: ref.sample,
        ref_level: ref.level,
      },
      pct,
      ref,
      match,
      it,
    });
  }

  if (backfill) {
    return NextResponse.json({
      ok: true,
      backfill: true,
      received: items.length,
      unique: seen.size,
      recognized: recognized.length,
      with_reference: withRef,
      reference_levels: byLevel,
      deals: deals.length,
      strong_deals: deals.filter((d) => d.pct >= ALERT_THRESHOLD).length,
    });
  }

  // 4) Guardar chollos y avisar solo de los nuevos
  let inserted = new Set<string>();
  if (deals.length) {
    const { data, error } = await db
      .from("deals")
      .upsert(
        deals.map((d) => d.row),
        { onConflict: "external_id", ignoreDuplicates: true },
      )
      .select("external_id");
    if (error) return NextResponse.json({ ok: false, error: `deals: ${error.message}` }, { status: 500 });
    inserted = new Set((data ?? []).map((d) => d.external_id));
  }

  let alerts = 0;
  let alertPhotos = 0;
  for (const d of deals) {
    if (!inserted.has(d.row.external_id) || d.pct < ALERT_THRESHOLD) continue;
    const card = cardLabel(d.match.card, d.match.parallel);
    const photo = vintedPhoto(d.it.photo);

    // Comparables: las ventas (o anuncios de eBay) que forman la referencia, con enlace.
    // Ventas → las más recientes; eBay → las más baratas (la referencia de eBay es la parte baja).
    const all = await loadComparables(db, d.ref).catch(() => []);
    const sold = d.ref.source === "vinted_sold";
    const ordered = sold ? [...all].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")) : all;
    // Copia guardada con el chollo (aunque luego desaparezcan los anuncios). Si falta la migración 008, se sigue.
    await db
      .from("deals")
      .update({ photo_url: photo, ref_comps: ordered.slice(0, 20) })
      .eq("external_id", d.row.external_id)
      .then(
        () => null,
        () => null,
      );

    const r = await sendDealAlert(
      dealAlertHtml({
        ...d.row,
        card,
        sample: d.ref.sample,
        source: d.ref.source,
        note:
          d.ref.level > 1
            ? `Precio estimado con ${d.ref.basedOn}, al no haber datos exactos de esta carta`
            : undefined,
        comps: ordered.slice(0, 4),
        point130: point130Query(d.match.card, d.match.parallel),
      }),
      { dealId: d.row.external_id, photo },
    );
    if (r.ok) alerts++;
    if (r.photo) alertPhotos++;
  }

  return NextResponse.json({
    ok: true,
    received: items.length,
    unique: seen.size,
    recognized: recognized.length,
    with_reference: withRef,
    reference_levels: byLevel,
    deals: deals.length,
    new_deals: inserted.size,
    alerts,
    alert_photos: alertPhotos,
    with_photo: recognized.filter(({ it }) => vintedPhoto(it.photo)).length,
  });
}
