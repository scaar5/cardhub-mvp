import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { ALERT_THRESHOLD, EXTREME_PCT, MIN_PRICE, MIN_REF_VALUE, TRACK_MIN_PRICE } from "@/lib/config";
import { judgeDeal } from "@/lib/deals";
import { excludedReason, isOffTopic } from "@/lib/filters";
import { recognize } from "@/lib/recognize";
import { point130Query } from "@/lib/point130";
import { median } from "@/lib/market";
import { candidateCardIds, cardLabel, loadReferences, printRun, resolveReference, type ResolvedReference } from "@/lib/reference";
import { VINTED_SEARCHES } from "@/lib/set-rules";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { dealAlertHtml, sendDealAlert, type AlertComparable } from "@/lib/telegram";
import { loadComparables } from "@/lib/valuation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Segunda opinión frente a los anuncios abiertos de Vinted (solo para referencias de eBay)
const ASKS_FRESH_HOURS = 4; // anuncio "abierto" = visto en las búsquedas en las últimas horas (el sweep da una vuelta en ~1,5 h)
const MIN_OPEN_ASKS = 3;
const INFLATED_RATIO = 0.75;
// Chollo "frente al mercado abierto" (cartas SIN referencia de ventas ni de eBay): el anuncio tiene que estar claramente
// por debajo de otros anuncios idénticos que se ofrecen ahora mismo en Vinted. Son precios pedidos, no ventas: más estricto.
const OPEN_MIN_ASKS = 3; // anuncios iguales (misma carta y variante) además del propio (13-nov: 4 → 3, decisión del usuario)
const OPEN_MIN_PCT = 35; // % por debajo de la mediana (13-nov: 45 → 35)
const OPEN_BELOW_MIN = 0.85; // y por debajo del más barato de los demás (×0,85)
const OPEN_MAX_ALERTS = 5; // tope de alertas de este tipo por llamada

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
  // Anuncios de ≥ TRACK_MIN_PRICE € que parecen una carta suelta de fútbol pero no se reconocen (colección o jugador
  // fuera del catálogo, insert, etc.). Se guardan con plataforma `vinted_x` para que, si se venden, la venta quede
  // registrada y se pueda reconocer más adelante (/api/reclassify) cuando el catálogo crezca.
  const others: InItem[] = [];
  for (const it of items) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    const { match } = recognize(it.title, it.set);
    if (match?.confidence === "alta") recognized.push({ it, match });
    else if (it.price >= TRACK_MIN_PRICE && !excludedReason(it.title) && !isOffTopic(it.title)) others.push(it);
  }

  // 2) Historial: guardar también los anuncios de Vinted (para analytics futuras)
  const now = new Date().toISOString();
  let othersSaved = 0;
  let othersError: string | undefined;
  for (let i = 0; i < others.length; i += 500) {
    const chunk = others.slice(i, i + 500);
    const { error } = await db.from("listings").upsert(
      chunk.map((it) => ({
        external_id: `vinted_x:${it.id}`,
        card_id: null,
        parallel: null,
        platform: "vinted_x",
        title: it.title,
        price: it.price,
        url: it.url,
        seen_at: now,
      })),
      { onConflict: "external_id" },
    );
    if (error) {
      othersError = error.message; // no frena el resto (chollos y alertas)
      break;
    }
    othersSaved += chunk.length;
  }
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
  type Cand = {
    row: {
      external_id: string;
      title: string;
      platform: string;
      price: number;
      market_value: number;
      url: string | null;
      query: string | null;
      card_id: string;
      parallel: string | null;
      ref_source: string;
      ref_sample: number;
      ref_level: number;
    };
    pct: number;
    ref: { value: number; sample: number; source: "vinted_sold" | "ebay" | "vinted_open"; level: number; basedOn?: string };
    match: (typeof recognized)[number]["match"];
    it: (typeof recognized)[number]["it"];
    comps?: AlertComparable[]; // solo los chollos "vinted_open": los otros anuncios abiertos
  };
  const candidates: Cand[] = [];
  const noRef: typeof recognized = []; // reconocidos sin ninguna referencia: candidatos a "chollo frente al mercado abierto"
  for (const { it, match } of recognized) {
    const ref = resolveReference(refs, match.card, match.parallel);
    if (!ref) {
      noRef.push({ it, match });
      continue;
    }
    withRef++;
    if (ref.level === 1) byLevel.exact++;
    else if (ref.level === 2) byLevel.sibling++;
    else byLevel.nearby++;
    const verdict = judgeDeal(it.price, ref);
    if (!("pct" in verdict)) continue;
    const pct = verdict.pct;
    candidates.push({
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

  // 3b) Anuncios abiertos de Vinted (vistos en las últimas horas) de las cartas implicadas: se usan para
  //     (a) segunda opinión en referencias de eBay y (b) chollos frente al mercado abierto en cartas sin referencia.
  let inflatedDropped = 0;
  let openRefDeals = 0;
  const deals = [...candidates];
  const ebayCandidates = candidates.filter((d) => d.ref.source === "ebay");
  const askIds = [...new Set([...ebayCandidates.map((d) => d.match.card.id), ...noRef.map((d) => d.match.card.id)])];
  if (askIds.length) {
    const active = new Date(Date.now() - ASKS_FRESH_HOURS * 3600_000).toISOString();
    const asks: { external_id: string; card_id: string; parallel: string | null; price: number; title: string; url: string | null }[] = [];
    for (let i = 0; i < askIds.length; i += 200) {
      const { data } = await db
        .from("listings")
        .select("external_id,card_id,parallel,price,title,url")
        .eq("platform", "vinted")
        .gte("seen_at", active)
        .gte("price", MIN_REF_VALUE)
        .in("card_id", askIds.slice(i, i + 200))
        .limit(8000);
      asks.push(...(data ?? []));
    }
    const sameCard = (cardId: string, parallel: string | null, selfId: string) => {
      const run = printRun(parallel);
      return asks.filter(
        (a) =>
          a.card_id === cardId &&
          a.external_id !== selfId &&
          (run !== null ? printRun(a.parallel) === run : (a.parallel ?? "") === (parallel ?? "")),
      );
    };
    for (const d of ebayCandidates) {
      const others = sameCard(d.match.card.id, d.match.parallel, d.row.external_id).map((a) => Number(a.price));
      if (others.length >= MIN_OPEN_ASKS && median(others) < d.ref.value * INFLATED_RATIO) {
        deals.splice(deals.indexOf(d), 1);
        inflatedDropped++;
      }
    }
    for (const { it, match } of noRef) {
      if (openRefDeals >= OPEN_MAX_ALERTS) break;
      const others = sameCard(match.card.id, match.parallel, `vinted:${it.id}`);
      if (others.length < OPEN_MIN_ASKS) continue;
      const prices = others.map((a) => Number(a.price));
      const mid = median(prices);
      const pct = Math.round((1 - it.price / mid) * 100);
      // Dentro de la banda fiable: bastante por debajo de la mediana, claramente bajo el más barato, y sin llegar al
      // descuento extremo (casi siempre es una variante mal reconocida, no una ganga)
      if (mid < MIN_REF_VALUE || pct < OPEN_MIN_PCT || pct >= EXTREME_PCT || it.price >= Math.min(...prices) * OPEN_BELOW_MIN) continue;
      openRefDeals++;
      deals.push({
        row: {
          external_id: `vinted:${it.id}`,
          title: it.title,
          platform: "vinted",
          price: it.price,
          market_value: mid,
          url: it.url,
          query: it.set ?? null,
          card_id: match.card.id,
          parallel: match.parallel,
          ref_source: "vinted_open",
          ref_sample: others.length,
          ref_level: 1,
        },
        pct,
        ref: { value: mid, sample: others.length, source: "vinted_open", level: 1 },
        match,
        it,
        comps: others
          .sort((a, b) => Number(a.price) - Number(b.price))
          .slice(0, 4)
          .map((a) => ({ title: a.title, price: Number(a.price), url: a.url, date: null, platform: "vinted" as const })),
      });
    }
  }

  if (backfill) {
    return NextResponse.json({
      ok: true,
      backfill: true,
      received: items.length,
      unique: seen.size,
      recognized: recognized.length,
      others_saved: othersSaved,
      ...(othersError ? { others_error: othersError } : {}),
      with_reference: withRef,
      reference_levels: byLevel,
      deals: deals.length,
      ebay_ref_inflated: inflatedDropped,
      open_ref_deals: openRefDeals,
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
    const all = d.comps ?? (await loadComparables(db, d.ref as ResolvedReference).catch(() => []));
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
    others_saved: othersSaved,
    ...(othersError ? { others_error: othersError } : {}),
    with_reference: withRef,
    reference_levels: byLevel,
    deals: deals.length,
    ebay_ref_inflated: inflatedDropped,
    open_ref_deals: openRefDeals,
    new_deals: inserted.size,
    alerts,
    alert_photos: alertPhotos,
    with_photo: recognized.filter(({ it }) => vintedPhoto(it.photo)).length,
  });
}
