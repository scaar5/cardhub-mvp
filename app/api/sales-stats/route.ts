import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { median } from "@/lib/market";
import { recognize } from "@/lib/recognize";
import { fetchAll } from "@/lib/fetch-all";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/sales-stats[?days=14]   (cabecera x-alert-secret)
 *
 *  - ventas / bajas por día (reconocidas y no reconocidas) → para saber a qué ritmo crece la base,
 *  - anuncios abiertos en seguimiento,
 *  - calibración: precio de eBay (como lo usa la referencia) frente a la mediana de ventas reales de Vinted de las
 *    mismas cartas → cuánto hay que rebajar una referencia de eBay para acercarla al precio al que se vende de verdad.
 */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "Falta SUPABASE_SECRET_KEY" }, { status: 503 });
  const days = Math.min(90, Math.max(1, Math.floor(Number(new URL(req.url).searchParams.get("days") ?? 14))));
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  // 1) Ventas y bajas por día
  type Closed = { platform: string; seen_at: string };
  const closed = await fetchAll<Closed>(
    (from, to) =>
      db
        .from("listings")
        .select("platform,seen_at")
        .in("platform", ["vinted_sold", "vinted_gone", "vinted_x_sold", "vinted_x_gone"])
        .gte("seen_at", since)
        .order("seen_at")
        .range(from, to) as unknown as PromiseLike<{ data: Closed[] | null; error: { message: string } | null }>,
  );
  if (closed.error) return NextResponse.json({ ok: false, error: closed.error.message }, { status: 500 });
  const day = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
  const perDay: Record<string, Record<string, number>> = {};
  for (const r of closed.data) {
    const d = (perDay[day(r.seen_at)] ??= { vinted_sold: 0, vinted_x_sold: 0, vinted_gone: 0, vinted_x_gone: 0 });
    d[r.platform]++;
  }

  // 2) Abiertos en seguimiento
  const count = async (platform: string) =>
    (await db.from("listings").select("external_id", { count: "exact", head: true }).eq("platform", platform)).count ?? 0;
  const [open, openX, soldTotal, soldXTotal] = await Promise.all([
    count("vinted"),
    count("vinted_x"),
    count("vinted_sold"),
    count("vinted_x_sold"),
  ]);

  // 3) Calibración eBay ↔ ventas reales (misma carta y variante, ≥2 ventas y ≥3 anuncios)
  type L = { card_id: string; parallel: string | null; price: number; platform: string; seen_at: string };
  const refs = await fetchAll<L>(
    (from, to) =>
      db
        .from("listings")
        .select("card_id,parallel,price,platform,seen_at")
        .in("platform", ["ebay", "vinted_sold"])
        .not("card_id", "is", null)
        .gte("seen_at", new Date(Date.now() - 90 * 86400_000).toISOString())
        .order("external_id")
        .range(from, to) as unknown as PromiseLike<{ data: L[] | null; error: { message: string } | null }>,
    80_000,
  );
  const groups = new Map<string, { ebay: number[]; sold: number[] }>();
  for (const r of refs.data) {
    const k = `${r.card_id}|${r.parallel ?? ""}`;
    const g = groups.get(k) ?? { ebay: [], sold: [] };
    (r.platform === "vinted_sold" ? g.sold : g.ebay).push(Number(r.price));
    groups.set(k, g);
  }
  const ratios: { key: string; sold: number; ebay: number; ratio: number; n_sold: number; n_ebay: number }[] = [];
  for (const [key, g] of groups) {
    if (g.sold.length < 2 || g.ebay.length < 3) continue;
    const sorted = [...g.ebay].sort((a, b) => a - b);
    // Igual que loadReferences: con <4 anuncios el más barato; con más, el percentil 25
    const ebay = g.ebay.length < 4 ? sorted[0] : sorted[Math.floor((sorted.length - 1) * 0.25)];
    const sold = median(g.sold);
    if (ebay > 0 && sold > 0) ratios.push({ key, sold, ebay, ratio: sold / ebay, n_sold: g.sold.length, n_ebay: g.ebay.length });
  }
  const rs = ratios.map((r) => r.ratio).sort((a, b) => a - b);
  const q = (p: number) => (rs.length ? Math.round(rs[Math.floor((rs.length - 1) * p)] * 100) / 100 : null);

  // 4) Por qué no se reconocen las ventas de `vinted_x_sold` (para decidir qué ampliar del catálogo / reconocedor)
  const xs = await db
    .from("listings")
    .select("title,price")
    .eq("platform", "vinted_x_sold")
    .order("seen_at", { ascending: false })
    .limit(400);
  const why: Record<string, number> = {};
  const samples: { title: string; price: number; why: string }[] = [];
  for (const r of xs.data ?? []) {
    const { match, reason } = recognize(r.title);
    const w = match ? `reconocible ahora (${match.confidence})` : (reason ?? "sin motivo").replace(/ "[^"]*"/g, "").slice(0, 60);
    why[w] = (why[w] ?? 0) + 1;
    if (samples.length < 25) samples.push({ title: r.title.slice(0, 110), price: Number(r.price), why: w });
  }

  return NextResponse.json({
    ok: true,
    days,
    sold_x_unrecognized_reasons: Object.fromEntries(Object.entries(why).sort((a, b) => b[1] - a[1])),
    sold_x_samples: samples,
    per_day: perDay,
    totals_in_period: {
      sold: closed.data.filter((r) => r.platform === "vinted_sold").length,
      sold_x: closed.data.filter((r) => r.platform === "vinted_x_sold").length,
      gone: closed.data.filter((r) => r.platform === "vinted_gone").length,
      gone_x: closed.data.filter((r) => r.platform === "vinted_x_gone").length,
    },
    tracked: { open_recognized: open, open_unrecognized: openX, sold_all_time: soldTotal, sold_x_all_time: soldXTotal },
    ebay_vs_sold: {
      cards: ratios.length,
      ratio_sold_over_ebay: { p25: q(0.25), median: q(0.5), p75: q(0.75) },
      sample: ratios
        .sort((a, b) => b.n_sold - a.n_sold)
        .slice(0, 12)
        .map((r) => ({ ...r, ratio: Math.round(r.ratio * 100) / 100 })),
    },
  });
}
