import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { ALERT_THRESHOLD, MIN_PRICE, SAVE_THRESHOLD } from "@/lib/config";
import { recognize } from "@/lib/recognize";
import { candidateCardIds, cardLabel, loadReferences, resolveReference } from "@/lib/reference";
import { VINTED_SEARCHES } from "@/lib/set-rules";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { dealMessage, sendTelegram } from "@/lib/telegram";

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
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }
  const db = getSupabaseAdmin();
  if (!db) {
    return NextResponse.json({ ok: false, error: "Falta SUPABASE_SECRET_KEY" }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as { items?: InItem[] } | null;
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
  //    En cascada: exacta → colección hermana (misma /N) → misma colección (numeración cercana)
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
    const pct = Math.round((1 - it.price / ref.value) * 100);
    if (pct < SAVE_THRESHOLD) continue;
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
      },
      pct,
      ref,
      match,
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
  for (const d of deals) {
    if (!inserted.has(d.row.external_id) || d.pct < ALERT_THRESHOLD) continue;
    const card = cardLabel(d.match.card, d.match.parallel);
    await sendTelegram(
      dealMessage({
        ...d.row,
        card,
        sample: d.ref.sample,
        source: d.ref.source,
        note:
          d.ref.level > 1
            ? `Precio estimado basado en ${d.ref.basedOn}, al no haber ventas exactas de ${card}`
            : undefined,
      }),
    );
    alerts++;
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
  });
}
