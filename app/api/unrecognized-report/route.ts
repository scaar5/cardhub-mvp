import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { fetchAll } from "@/lib/fetch-all";
import { recognize } from "@/lib/recognize";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/unrecognized-report   (cabecera x-alert-secret)
 * Qué hay en los anuncios `vinted_x` (≥10 €, no reconocidos como carta del catálogo) y por qué:
 * motivos, y las palabras / parejas de palabras más repetidas por motivo → qué colecciones o jugadores faltan.
 */
const STOP = new Set(
  "de la el y en con para por un una los las del al rc card cards carta cartas cromo cromos nuevo nueva new rookie topps panini #".split(" "),
);
const tokens = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9/ ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w) && !/^\d{1,3}$/.test(w));

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "Falta SUPABASE_SECRET_KEY" }, { status: 503 });

  type Row = { title: string; price: number };
  // Por plataforma y con el mismo filtro de fecha que usa el seguimiento (la consulta conjunta superaba el tiempo de Supabase)
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const data: Row[] = [];
  for (const platform of ["vinted_x_sold", "vinted_x_gone", "vinted_x"]) {
    const r = await fetchAll<Row>(
      (from, to) =>
        db
          .from("listings")
          .select("title,price")
          .eq("platform", platform)
          .gte("seen_at", since)
          .order("external_id")
          .range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
      platform === "vinted_x" ? 9000 : 3000,
    );
    if (r.error) return NextResponse.json({ ok: false, error: `${platform}: ${r.error.message}` }, { status: 500 });
    data.push(...r.data);
  }

  const reasons: Record<string, number> = {};
  const words: Record<string, Record<string, number>> = {};
  const brands: Record<string, number> = { topps: 0, panini: 0, otros: 0 };
  const recognizable: string[] = [];
  for (const r of data) {
    const { match, reason } = recognize(r.title);
    if (match && match.confidence === "alta") {
      if (recognizable.length < 15) recognizable.push(r.title.slice(0, 100));
      reasons["reconocible ahora"] = (reasons["reconocible ahora"] ?? 0) + 1;
      continue;
    }
    const key = match ? `media (${match.confidence})` : (reason ?? "sin motivo").replace(/ "[^"]*"/g, "").slice(0, 50);
    reasons[key] = (reasons[key] ?? 0) + 1;
    const low = r.title.toLowerCase();
    brands[/topps/.test(low) ? "topps" : /panini|prizm|donruss|select|optic|immaculate|mosaic|national treasures/.test(low) ? "panini" : "otros"]++;
    const t = tokens(r.title);
    const bucket = (words[key] ??= {});
    for (let i = 0; i < t.length; i++) {
      bucket[t[i]] = (bucket[t[i]] ?? 0) + 1;
      if (i + 1 < t.length) bucket[`${t[i]} ${t[i + 1]}`] = (bucket[`${t[i]} ${t[i + 1]}`] ?? 0) + 1;
    }
  }
  const top = (m: Record<string, number>, n: number) =>
    Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([w, c]) => `${w}: ${c}`);

  return NextResponse.json({
    ok: true,
    total: data.length,
    brands,
    reasons: Object.fromEntries(Object.entries(reasons).sort((a, b) => b[1] - a[1])),
    top_words_by_reason: Object.fromEntries(
      Object.entries(reasons)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([k]) => [k, words[k] ? top(words[k], 45) : []]),
    ),
    recognizable_sample: recognizable,
  });
}
