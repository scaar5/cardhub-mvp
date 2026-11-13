import Link from "next/link";
import { fetchAll } from "@/lib/fetch-all";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { computeTrends, MIN_PRICE_SAMPLES, type PlayerTrend, type Sale, type Ask } from "@/lib/trends";

export const metadata = { title: "Tendencias — sCARDs" };
export const revalidate = 600; // cada 10 min

const eur = (v: number | null) =>
  v === null ? "—" : v.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: v < 100 ? 2 : 0 });
const pct = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : ""}${v} %`);

export default async function TendenciasPage() {
  const db = getSupabaseAdmin();
  if (!db) return <main className="mx-auto max-w-5xl px-5 py-10">Falta la conexión con la base de datos.</main>;

  const since90 = new Date(Date.now() - 90 * 86400_000).toISOString();
  const fresh = new Date(Date.now() - 6 * 3600_000).toISOString(); // anuncio "abierto" = visto en las últimas 6 h
  const [salesRes, asksRes] = await Promise.all([
    fetchAll<Sale>(
      (from, to) =>
        db
          .from("listings")
          .select("card_id,parallel,price,seen_at")
          .eq("platform", "vinted_sold")
          .not("card_id", "is", null)
          .gte("seen_at", since90)
          .order("seen_at")
          .range(from, to) as unknown as PromiseLike<{ data: Sale[] | null; error: { message: string } | null }>,
      50_000,
    ),
    fetchAll<Ask>(
      (from, to) =>
        db
          .from("listings")
          .select("card_id")
          .eq("platform", "vinted")
          .not("card_id", "is", null)
          .gte("seen_at", fresh)
          .order("external_id")
          .range(from, to) as unknown as PromiseLike<{ data: Ask[] | null; error: { message: string } | null }>,
      60_000,
    ),
  ]);
  const sales = salesRes.data.map((s) => ({ ...s, price: Number(s.price) }));
  const t = computeTrends(sales, asksRes.data);
  const fewData = t.daysOfData < 28;

  return (
    <main className="mx-auto max-w-5xl px-5 pb-16 pt-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 rounded-full bg-card px-3.5 py-1.5 text-sm text-muted shadow-card hover:text-ink"
      >
        ← Inicio
      </Link>

      <h1 className="mt-8 text-3xl font-semibold tracking-tight">Tendencias</h1>
      <p className="mt-2 max-w-2xl text-[15px] text-muted">
        Qué jugadores se venden más, cuáles suben o bajan de precio y dónde hay más demanda que oferta. Todo sale de
        ventas reales en Vinted ({t.totalSales7.toLocaleString("es-ES")} ventas con carta en los últimos 7 días) y de
        los anuncios abiertos ahora. Se actualiza cada 10 minutos.
      </p>
      {fewData && (
        <p className="mt-3 max-w-2xl rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Hay {t.daysOfData} días de ventas registradas. El volumen y la oferta/demanda ya son fiables; las subidas y
          bajadas de precio necesitan unas 4–6 semanas de datos, así que de momento salen pocos jugadores y con cautela.
        </p>
      )}

      {/* Volumen */}
      <Section title="Más vendidos esta semana" sub="Ventas de los últimos 7 días y cambio frente a los 7 anteriores.">
        <Table
          rows={t.topVolume}
          empty="Todavía no hay ventas esta semana."
          cols={[
            { h: "Ventas 7 días", v: (p) => <b>{p.sales7}</b> },
            { h: "Semana anterior", v: (p) => p.salesPrev7 },
            { h: "Cambio", v: (p) => <Change v={p.volumeChangePct} /> },
            { h: "Precio mediano", v: (p) => eur(p.medianPrice7), hideSm: true },
          ]}
        />
      </Section>

      {t.risingVolume.length > 0 && (
        <Section title="Se venden cada vez más" sub="Los que más han aumentado sus ventas respecto a la semana anterior.">
          <Table
            rows={t.risingVolume}
            empty=""
            cols={[
              { h: "Ventas 7 días", v: (p) => <b>{p.sales7}</b> },
              { h: "Semana anterior", v: (p) => p.salesPrev7 },
              { h: "Cambio", v: (p) => <Change v={p.volumeChangePct} /> },
            ]}
          />
        </Section>
      )}

      {/* Precio */}
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="text-lg font-semibold">Suben de precio</h2>
          <p className="mt-1 text-sm text-muted">Sus cartas se venden más caras que de costumbre (últimos 7 días frente a los 30 anteriores).</p>
          <PriceList rows={t.priceUp} />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Bajan de precio</h2>
          <p className="mt-1 text-sm text-muted">Sus cartas se venden más baratas que de costumbre.</p>
          <PriceList rows={t.priceDown} />
        </div>
      </div>
      <p className="mt-3 text-xs text-faint">
        Cómo se calcula: cada venta se compara con el precio habitual de esa misma carta y variante (así no se mezcla una
        base de 5 € con una numerada /10). Hace falta un mínimo de {MIN_PRICE_SAMPLES} ventas comparables en cada periodo.
      </p>

      {/* Oferta / demanda */}
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="text-lg font-semibold">Más demanda que oferta</h2>
          <p className="mt-1 text-sm text-muted">
            Se venden rápido para lo poco que hay a la venta: buenas para revender. &quot;Stock&quot; = semanas que se tardaría en
            vender todo lo que hay ahora al ritmo actual.
          </p>
          <SupplyList rows={t.hot} kind="hot" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Más oferta que demanda</h2>
          <p className="mt-1 text-sm text-muted">Muchos anuncios y pocas ventas: cuesta venderlas y los precios tienden a bajar.</p>
          <SupplyList rows={t.cold} kind="cold" />
        </div>
      </div>
    </main>
  );
}

function Section({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted">{sub}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Player({ p }: { p: PlayerTrend }) {
  return (
    <Link href={`/jugadores/${p.slug}`} className="font-medium hover:underline">
      {p.name}
    </Link>
  );
}

function Change({ v }: { v: number | null }) {
  if (v === null) return <span className="text-xs text-faint">nuevo</span>;
  return <span className={v > 0 ? "font-semibold text-emerald-600" : v < 0 ? "font-semibold text-rose-600" : "text-muted"}>{pct(v)}</span>;
}

function Table({
  rows,
  cols,
  empty,
}: {
  rows: PlayerTrend[];
  cols: { h: string; v: (p: PlayerTrend) => React.ReactNode; hideSm?: boolean }[];
  empty: string;
}) {
  if (!rows.length) return <p className="rounded-2xl bg-card p-4 text-sm text-muted shadow-card">{empty}</p>;
  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
            <th className="px-4 py-2.5 font-medium">#</th>
            <th className="px-2 py-2.5 font-medium">Jugador</th>
            {cols.map((c) => (
              <th key={c.h} className={`px-3 py-2.5 text-right font-medium ${c.hideSm ? "hidden sm:table-cell" : ""}`}>
                {c.h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={p.slug} className="border-b border-line last:border-0">
              <td className="px-4 py-2.5 text-faint tabular-nums">{i + 1}</td>
              <td className="px-2 py-2.5">
                <Player p={p} />
              </td>
              {cols.map((c) => (
                <td key={c.h} className={`px-3 py-2.5 text-right tabular-nums ${c.hideSm ? "hidden sm:table-cell" : ""}`}>
                  {c.v(p)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Spark({ values }: { values: (number | null)[] }) {
  const pts = values.map((v, i) => ({ v, i })).filter((x): x is { v: number; i: number } => x.v !== null);
  if (pts.length < 2) return <span className="inline-block w-16" />;
  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v));
  const y = (v: number) => (max === min ? 10 : 18 - ((v - min) / (max - min)) * 16);
  const d = pts.map((p, k) => `${k ? "L" : "M"}${(p.i / (values.length - 1)) * 60 + 2},${y(p.v).toFixed(1)}`).join(" ");
  const up = pts[pts.length - 1].v >= pts[0].v;
  return (
    <svg width="64" height="20" viewBox="0 0 64 20" className="inline-block align-middle" aria-hidden>
      <path d={d} fill="none" strokeWidth="1.8" className={up ? "stroke-emerald-500" : "stroke-rose-500"} />
    </svg>
  );
}

function PriceList({ rows }: { rows: PlayerTrend[] }) {
  if (!rows.length)
    return (
      <p className="mt-3 rounded-2xl bg-card p-4 text-sm text-muted shadow-card">
        Todavía no hay jugadores con ventas suficientes para comparar precios.
      </p>
    );
  return (
    <div className="mt-3 overflow-hidden rounded-2xl bg-card shadow-card">
      {rows.map((p) => (
        <div key={p.slug} className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-sm last:border-0">
          <div className="min-w-0 flex-1">
            <Player p={p} />
            <p className="text-xs text-faint">
              {p.priceSamples[0]} ventas recientes · {p.priceSamples[1]} anteriores
            </p>
          </div>
          <Spark values={p.weekly} />
          <span className="w-16 text-right">
            <Change v={p.priceChangePct} />
          </span>
        </div>
      ))}
    </div>
  );
}

function SupplyList({ rows, kind }: { rows: PlayerTrend[]; kind: "hot" | "cold" }) {
  if (!rows.length)
    return <p className="mt-3 rounded-2xl bg-card p-4 text-sm text-muted shadow-card">Nada destacable ahora mismo.</p>;
  return (
    <div className="mt-3 overflow-hidden rounded-2xl bg-card shadow-card">
      <div className="flex gap-3 border-b border-line px-4 py-2 text-xs uppercase tracking-wide text-faint">
        <span className="flex-1">Jugador</span>
        <span className="w-16 text-right">Ventas/sem</span>
        <span className="w-16 text-right">A la venta</span>
        <span className="w-16 text-right">Stock</span>
      </div>
      {rows.map((p) => (
        <div key={p.slug} className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-sm last:border-0">
          <span className="min-w-0 flex-1 truncate">
            <Player p={p} />
          </span>
          <span className="w-16 text-right tabular-nums">{p.sales7}</span>
          <span className="w-16 text-right tabular-nums">{p.open}</span>
          <span className={`w-16 text-right font-semibold tabular-nums ${kind === "hot" ? "text-emerald-600" : "text-rose-600"}`}>
            {p.weeksOfStock === null ? "∞" : `${p.weeksOfStock.toLocaleString("es-ES")} sem`}
          </span>
        </div>
      ))}
    </div>
  );
}
