import Link from "next/link";
import SalesChart, { type ChartPoint } from "@/components/SalesChart";
import { CARDS, normalize, setBySlug } from "@/lib/catalog";
import { median } from "@/lib/market";
import { getSupabase } from "@/lib/supabase";

export const metadata = { title: "Historial de ventas — sCARDs" };
export const revalidate = 300;

type Params = Promise<{ q?: string; min?: string; card?: string }>;

interface Sale {
  card_id: string;
  parallel: string | null;
  price: number;
  seen_at: string;
  title: string;
  url: string | null;
}

const cardById = new Map(CARDS.map((c) => [c.id, c]));
const eur = (n: number) => `${n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const fecha = (s: string) => new Date(s).toLocaleDateString("es-ES", { day: "numeric", month: "short" });

function describe(cardId: string, parallel: string | null) {
  const c = cardById.get(cardId);
  const set = c ? setBySlug.get(c.set_slug) : undefined;
  return {
    player: c?.player ?? cardId,
    set: set?.name ?? c?.set_slug ?? "",
    detail: [c ? `#${c.number}` : null, c && c.subset !== "Base" ? c.subset : null, parallel].filter(Boolean).join(" · "),
    search: normalize(`${c?.player ?? ""} ${c?.team ?? ""} ${set?.name ?? ""} ${c?.subset ?? ""} ${parallel ?? ""}`),
  };
}

export default async function VentasPage({ searchParams }: { searchParams: Params }) {
  const { q = "", min: minRaw, card = "" } = await searchParams;
  const min = Number.isFinite(Number(minRaw)) && minRaw !== undefined && minRaw !== "" ? Number(minRaw) : 5;

  const db = getSupabase();
  let sales: Sale[] = [];
  let tracked = 0;
  if (db) {
    const [s, t] = await Promise.all([
      db
        .from("listings")
        .select("card_id,parallel,price,seen_at,title,url")
        .eq("platform", "vinted_sold")
        .order("seen_at", { ascending: true })
        .limit(5000),
      db.from("listings").select("external_id", { count: "exact", head: true }).eq("platform", "vinted"),
    ]);
    sales = (s.data ?? []).map((r) => ({ ...r, price: Number(r.price) })) as Sale[];
    tracked = t.count ?? 0;
  }

  const words = normalize(q).split(" ").filter(Boolean);
  const filtered = sales.filter((s) => {
    if (s.price < min) return false;
    if (!words.length) return true;
    const d = describe(s.card_id, s.parallel).search;
    return words.every((w) => d.includes(w));
  });

  // Agrupar por carta + variante
  const groups = new Map<string, Sale[]>();
  for (const s of filtered) {
    const k = `${s.card_id}|${s.parallel ?? ""}`;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  const rows = [...groups.entries()]
    .map(([key, list]) => {
      const first = list[0];
      const last = list[list.length - 1];
      const change = last.price - first.price;
      return {
        key,
        ...describe(first.card_id, first.parallel),
        count: list.length,
        first: first.price,
        last: last.price,
        lastAt: last.seen_at,
        median: median(list.map((s) => s.price)),
        change,
        pct: list.length > 1 && first.price ? (change / first.price) * 100 : null,
      };
    })
    .sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt));

  const selected = card && groups.has(card) ? card : "";
  const selSales = selected ? groups.get(selected)! : [];
  const sel = selected ? rows.find((r) => r.key === selected)! : null;

  const chart: ChartPoint[] = selected
    ? selSales.map((s) => ({ t: Date.parse(s.seen_at), y: s.price }))
    : filtered.map((s, i) => ({
        t: Date.parse(s.seen_at),
        y: i + 1,
        label: `${describe(s.card_id, s.parallel).player} · ${eur(s.price)}`,
      }));

  const total = filtered.reduce((a, s) => a + s.price, 0);
  const href = (p: { card?: string }) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (min !== 5) u.set("min", String(min));
    if (p.card) u.set("card", p.card);
    const qs = u.toString();
    return qs ? `/ventas?${qs}` : "/ventas";
  };

  return (
    <main className="mx-auto max-w-5xl px-5 pb-16 pt-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 rounded-full bg-card px-3.5 py-1.5 text-sm text-muted shadow-card hover:text-ink"
      >
        ← Inicio
      </Link>

      <h1 className="mt-8 text-3xl font-semibold tracking-tight">Historial de ventas</h1>
      <p className="mt-2 max-w-2xl text-[15px] text-muted">
        Ventas reales en Vinted de las cartas del catálogo. Cada hora se revisan los anuncios en seguimiento y se apuntan
        los que se han vendido, con su precio y fecha. Si se vendió con una oferta, el precio real pudo ser algo menor.
      </p>

      <form action="/ventas" className="mt-6 flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Jugador, equipo, colección o variante…"
          className="min-w-0 flex-1 rounded-2xl bg-card px-4 py-3 text-[15px] shadow-card outline-none ring-accent/30 placeholder:text-faint focus:ring-2"
        />
        <label className="flex items-center gap-2 rounded-2xl bg-card px-4 py-3 text-sm text-muted shadow-card">
          Desde
          <input
            name="min"
            type="number"
            min={0}
            step={1}
            defaultValue={min}
            className="w-16 bg-transparent text-ink outline-none"
          />
          €
        </label>
        <button className="rounded-2xl bg-ink px-5 py-3 text-sm font-semibold text-white">Filtrar</button>
      </form>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Ventas", filtered.length.toLocaleString("es-ES")],
          ["Cartas distintas", rows.length.toLocaleString("es-ES")],
          ["Importe vendido", eur(total)],
          ["Anuncios en seguimiento", tracked.toLocaleString("es-ES")],
        ].map(([label, value]) => (
          <div key={label} className="rounded-3xl bg-card p-4 shadow-card">
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
          </div>
        ))}
      </div>

      <section className="mt-6 rounded-3xl bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">
            {sel ? `${sel.player} — precio de cada venta` : "Ventas acumuladas"}
          </h2>
          {sel && (
            <Link href={href({})} className="text-sm text-accent hover:underline">
              ← Ver todas
            </Link>
          )}
        </div>
        {sel && (
          <p className="mt-1 text-sm text-muted">
            {sel.set} · {sel.detail} · mediana {eur(sel.median)}
          </p>
        )}
        <div className="mt-4">
          {chart.length ? (
            <SalesChart points={chart} format={sel ? "eur" : "count"} step={!sel} />
          ) : (
            <p className="py-12 text-center text-sm text-muted">
              Todavía no hay ventas{min > 0 ? ` desde ${min} €` : ""}
              {q ? " para esa búsqueda" : ""}. El seguimiento revisa 60 anuncios cada hora: irán apareciendo aquí.
            </p>
          )}
        </div>
      </section>

      {sel ? (
        <section className="mt-6 overflow-hidden rounded-3xl bg-card shadow-card">
          <h2 className="px-5 pt-5 font-semibold">Ventas de esta carta</h2>
          <ul className="mt-3 divide-y divide-line">
            {[...selSales].reverse().map((s, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="min-w-0 truncate text-muted">{s.title}</span>
                <span className="shrink-0 tabular-nums">
                  {fecha(s.seen_at)} · <strong>{eur(s.price)}</strong>
                  {s.url && (
                    <a href={s.url} target="_blank" rel="noreferrer" className="ml-2 text-accent hover:underline">
                      Ver
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        rows.length > 0 && (
          <section className="mt-6 overflow-x-auto rounded-3xl bg-card shadow-card">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="px-5 py-3 font-medium">Carta</th>
                  <th className="px-3 py-3 text-right font-medium">Ventas</th>
                  <th className="px-3 py-3 text-right font-medium">Primera</th>
                  <th className="px-3 py-3 text-right font-medium">Última</th>
                  <th className="px-3 py-3 text-right font-medium">Mediana</th>
                  <th className="px-3 py-3 text-right font-medium">Cambio</th>
                  <th className="px-5 py-3 text-right font-medium">Cambio %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.key} className="hover:bg-canvas">
                    <td className="px-5 py-3">
                      <Link href={href({ card: r.key })} className="block">
                        <span className="text-xs text-muted">{r.set}</span>
                        <span className="block font-semibold hover:text-accent">{r.player}</span>
                        <span className="text-xs text-muted">{r.detail}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.count}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{eur(r.first)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {eur(r.last)}
                      <span className="block text-xs text-muted">{fecha(r.lastAt)}</span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{eur(r.median)}</td>
                    <td
                      className={`px-3 py-3 text-right tabular-nums ${r.count < 2 ? "text-faint" : r.change < 0 ? "text-bad" : r.change > 0 ? "text-good" : ""}`}
                    >
                      {r.count < 2 ? "—" : `${r.change > 0 ? "+" : ""}${eur(r.change)}`}
                    </td>
                    <td
                      className={`px-5 py-3 text-right tabular-nums ${r.pct === null ? "text-faint" : r.pct < 0 ? "text-bad" : r.pct > 0 ? "text-good" : ""}`}
                    >
                      {r.pct === null ? "—" : `${r.pct > 0 ? "+" : ""}${r.pct.toFixed(1)} %`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )
      )}
    </main>
  );
}
