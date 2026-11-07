import Link from "next/link";
import { notFound } from "next/navigation";
import PlayerSearch from "@/components/PlayerSearch";
import SalesLineChart, { type SalePoint } from "@/components/SalesLineChart";
import SelectNav from "@/components/SelectNav";
import type { CatalogCard } from "@/lib/catalog";
import { fetchAll } from "@/lib/fetch-all";
import { median } from "@/lib/market";
import { photoPublicUrl } from "@/lib/photo-url";
import { cardSet, playerBySlug } from "@/lib/players";
import { getSupabase } from "@/lib/supabase";

export const revalidate = 300;

type Params = Promise<{ slug: string }>;
type Search = Promise<{ card?: string; par?: string; dias?: string }>;

interface Row {
  external_id: string;
  card_id: string;
  parallel: string | null;
  platform: string;
  price: number;
  seen_at: string;
  title: string;
  url: string | null;
  photo_path: string | null;
  photo_url: string | null;
}

/** Un anuncio de Vinted se considera "a la venta ahora" si el barrido lo ha visto en estas horas. */
const OPEN_HOURS = 6;
const PERIODS = [
  [30, "1 mes"],
  [90, "3 meses"],
  [180, "6 meses"],
  [365, "1 año"],
  [0, "Todo"],
] as const;

const eur = (n: number) => `${n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const fecha = (s: string | number) => new Date(s).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid" });
const fechaNum = (t: number) => new Date(t).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Madrid" });
const parKey = (p: string | null) => p ?? "base";
const parLabel = (k: string) => (k === "base" ? "Base (sin numerar)" : k);
const itemId = (s: string) => s.match(/(\d{6,})/)?.[1] ?? s;
const photoOf = (r: Row) => photoPublicUrl(r.photo_path) ?? r.photo_url ?? null;

export async function generateMetadata({ params }: { params: Params }) {
  const { slug } = await params;
  const p = playerBySlug.get(slug);
  return { title: p ? `${p.name} — ventas — sCARDs` : "Jugador — sCARDs" };
}

async function loadRows(ids: string[]): Promise<Row[]> {
  const db = getSupabase();
  if (!db || !ids.length) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 80) chunks.push(ids.slice(i, i + 80));
  const parts = await Promise.all(
    chunks.map((chunk) =>
      fetchAll<Row>(
        (from, to) =>
          db
            .from("listings")
            .select("external_id,card_id,parallel,platform,price,seen_at,title,url,photo_path,photo_url")
            .in("card_id", chunk)
            .in("platform", ["vinted_sold", "vinted_gone", "vinted"])
            .order("seen_at", { ascending: false })
            .range(from, to),
        20_000,
      ),
    ),
  );
  return parts.flatMap((p) => p.data).map((r) => ({ ...r, price: Number(r.price) }));
}

function setInfo(c: CatalogCard) {
  const s = cardSet(c);
  return { set: s.name.replace(new RegExp(`\\s*${s.season}$`), ""), season: s.season };
}

export default async function JugadorPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { slug } = await params;
  const player = playerBySlug.get(slug);
  if (!player) notFound();
  const sp = await searchParams;

  const cardMap = new Map(player.cards.map((c) => [c.id, c]));
  const all = await loadRows(player.cards.map((c) => c.id));

  const closed = new Set(all.filter((r) => r.platform !== "vinted").map((r) => itemId(r.external_id)));
  const openSince = Date.now() - OPEN_HOURS * 3600_000;
  const salesAll = all.filter((r) => r.platform === "vinted_sold");
  const openAll = all
    .filter((r) => r.platform === "vinted" && Date.parse(r.seen_at) >= openSince && !closed.has(itemId(r.external_id)))
    .sort((a, b) => a.price - b.price);

  // Cartas (colección + insert + número) con ventas registradas → primer desplegable
  const byCard = new Map<string, Row[]>();
  for (const r of salesAll) byCard.set(r.card_id, [...(byCard.get(r.card_id) ?? []), r]);
  const cardList = [...byCard.entries()].sort(
    (a, b) => b[1].length - a[1].length || b[1][0].seen_at.localeCompare(a[1][0].seen_at),
  );

  const header = (
    <div className="flex flex-wrap items-center gap-3">
      <Link
        href="/jugadores"
        className="inline-flex items-center gap-1.5 rounded-full bg-card px-3.5 py-1.5 text-sm text-muted shadow-card hover:text-ink"
      >
        ← Jugadores
      </Link>
      <div className="min-w-[240px] flex-1">
        <PlayerSearch />
      </div>
    </div>
  );

  if (!cardList.length) {
    return (
      <main className="mx-auto max-w-5xl px-5 pb-16 pt-6">
        {header}
        <h1 className="mt-8 text-3xl font-semibold tracking-tight">{player.name}</h1>
        <p className="mt-2 text-[15px] text-muted">
          {player.teams.join(" · ")} · {player.cards.length} cartas en el catálogo
        </p>
        <div className="mt-6 rounded-3xl bg-card p-8 text-center shadow-card">
          <p className="font-semibold">Todavía no hay ventas registradas de {player.name}.</p>
          <p className="mt-1 text-sm text-muted">La vigilancia de Vinted las irá apuntando en cuanto se venda alguna de sus cartas.</p>
        </div>
        <OpenList rows={openAll} cardMap={cardMap} player={player.name} />
      </main>
    );
  }

  const card = sp.card && byCard.has(sp.card) ? sp.card : cardList[0][0];
  const c = cardMap.get(card)!;
  const cardSales = byCard.get(card)!;

  // Variantes de esa carta con ventas → segundo desplegable
  const parCount = new Map<string, number>();
  for (const r of cardSales) parCount.set(parKey(r.parallel), (parCount.get(parKey(r.parallel)) ?? 0) + 1);
  const pars = [...parCount.entries()].sort((a, b) => b[1] - a[1]);
  const par = sp.par && parCount.has(sp.par) ? sp.par : pars[0][0];
  const dias = PERIODS.some(([d]) => String(d) === sp.dias) ? Number(sp.dias) : 0;

  const href = (o: { card?: string; par?: string; dias?: number }) => {
    const u = new URLSearchParams();
    const cc = o.card ?? card;
    u.set("card", cc);
    const pp = o.card && o.card !== card ? undefined : (o.par ?? par);
    if (pp) u.set("par", pp);
    const d = o.dias ?? dias;
    if (d) u.set("dias", String(d));
    return `/jugadores/${slug}?${u.toString()}`;
  };

  const sel = cardSales.filter((r) => parKey(r.parallel) === par); // más reciente primero
  const since = dias ? Date.now() - dias * 86400_000 : 0;
  const period = sel.filter((r) => Date.parse(r.seen_at) >= since).reverse(); // más antigua primero
  const prices = period.map((r) => r.price);
  const start = period[0]?.price;
  const current = period[period.length - 1]?.price;
  const change = period.length >= 2 ? current! - start! : null;
  const growth = change !== null && start ? (change / start) * 100 : null;
  const last = sel[0];
  const photo = sel.map(photoOf).find(Boolean) ?? null;
  const info = setInfo(c);

  const points: SalePoint[] = period.map((r) => ({
    t: Date.parse(r.seen_at),
    y: r.price,
    title: r.title,
    url: r.url,
    photo: photoOf(r),
  }));
  const from = since || Math.min(period[0] ? Date.parse(period[0].seen_at) : Date.now(), Date.now() - 30 * 86400_000);
  const to = Date.now();

  const cardOptions = cardList.map(([id, rows]) => {
    const cc = cardMap.get(id)!;
    const i = setInfo(cc);
    return {
      href: href({ card: id }),
      label: `${i.season} · ${i.set} · ${cc.subset !== "Base" ? `${cc.subset} ` : ""}#${cc.number} (${rows.length} ${rows.length === 1 ? "venta" : "ventas"})`,
    };
  });
  const parOptions = pars.map(([k, n]) => ({ href: href({ par: k }), label: `${parLabel(k)} (${n})` }));
  const periodOptions = PERIODS.map(([d, l]) => ({ href: href({ dias: d }), label: l }));
  const openSame = openAll.filter((r) => r.card_id === card);

  const stat = (label: string, value: string, tone?: "good" | "bad") => (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : ""}`}>{value}</p>
    </div>
  );
  const tone = (n: number | null) => (n === null || n === 0 ? undefined : n > 0 ? "good" : "bad");
  const sign = (n: number) => (n > 0 ? "+" : "");

  return (
    <main className="mx-auto max-w-6xl px-5 pb-16 pt-6">
      {header}

      {/* Carta elegida */}
      <section className="mt-8 grid gap-8 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="flex aspect-[4/3] items-center justify-center rounded-3xl bg-card p-6 shadow-card">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt={`${player.name} ${info.set}`} className="max-h-full max-w-full rounded-lg object-contain" />
          ) : (
            <p className="text-sm text-faint">Sin foto</p>
          )}
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {info.season} {info.set} {c.player} #{c.number}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {[c.subset !== "Base" ? c.subset : "Base", c.rookie ? "Rookie (RC)" : null, c.team].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <SelectNav label="Carta (colección e insert)" value={href({})} options={cardOptions} className="max-w-full flex-1 basis-72" />
            <SelectNav label="Variante" value={href({})} options={parOptions} className="basis-48" />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            {stat("Última venta", eur(last.price))}
            {stat("Fecha última venta", fecha(last.seen_at))}
            {stat("Ventas registradas", String(sel.length))}
            {stat("Mediana", eur(median(sel.map((r) => r.price))))}
          </div>
        </div>
      </section>

      {/* Ventas */}
      <section className="mt-10 border-t border-line pt-8">
        <h2 className="text-2xl font-bold tracking-tight">VENTAS</h2>
        <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)]">
          <div className="grid h-fit grid-cols-2 gap-x-6 gap-y-5">
            {stat("Crecimiento", growth === null ? "—" : `${sign(growth)}${growth.toFixed(2)} %`, tone(growth))}
            {stat("Cambio en €", change === null ? "—" : `${sign(change)}${eur(change)}`, tone(change))}
            {stat("Precio inicial", start !== undefined ? eur(start) : "—")}
            {stat("Precio actual", current !== undefined ? eur(current) : "—")}
            {stat("Nº de ventas", String(period.length))}
            {stat("Precio medio", prices.length ? eur(prices.reduce((a, b) => a + b, 0) / prices.length) : "—")}
            {stat("Precio más bajo", prices.length ? eur(Math.min(...prices)) : "—")}
            {stat("Precio más alto", prices.length ? eur(Math.max(...prices)) : "—")}
          </div>
          <div>
            <div className="rounded-3xl bg-card p-4 shadow-card">
              {points.length ? (
                <SalesLineChart points={points} from={from} to={to} />
              ) : (
                <p className="py-16 text-center text-sm text-muted">No hay ventas de esta variante en este periodo.</p>
              )}
              <p className="mt-1 text-center text-xs text-muted">
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-good" />
                {info.season} {info.set} {c.player} #{c.number} · {parLabel(par)}
              </p>
            </div>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
              <p className="text-sm text-muted">
                {fechaNum(from)} – {fechaNum(to)}
              </p>
              <SelectNav label="Periodo" value={href({})} options={periodOptions} />
            </div>
          </div>
        </div>
      </section>

      {/* Lista de ventas */}
      <section className="mt-10 overflow-hidden rounded-3xl bg-card shadow-card">
        <h2 className="px-5 pt-5 font-semibold">Ventas registradas de esta carta</h2>
        <ul className="mt-3 divide-y divide-line">
          {sel.map((r) => (
            <Item key={r.external_id} r={r} c={c} />
          ))}
        </ul>
      </section>

      <OpenList rows={openSame} cardMap={cardMap} player={player.name} title="Esta carta a la venta en Vinted ahora" />
    </main>
  );
}

function Item({ r, c }: { r: Row; c: CatalogCard }) {
  const photo = photoOf(r);
  const i = setInfo(c);
  return (
    <li className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
      <span className="flex min-w-0 items-center gap-3">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" loading="lazy" className="h-16 w-12 shrink-0 rounded-md bg-line object-cover" />
        ) : (
          <span className="h-16 w-12 shrink-0 rounded-md bg-line" />
        )}
        <span className="min-w-0">
          <span className="block truncate font-semibold">{c.player}</span>
          <span className="block truncate">
            {i.set}{" "}
            <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent">{i.season}</span>
          </span>
          <span className="block truncate text-xs text-muted">
            {[`#${c.number}`, c.subset !== "Base" ? c.subset : null, parLabel(parKey(r.parallel))].filter(Boolean).join(" · ")}
          </span>
          <span className="block truncate text-xs text-faint" title={r.title}>
            {r.title}
          </span>
        </span>
      </span>
      <span className="shrink-0 text-right tabular-nums">
        <strong>{eur(r.price)}</strong>
        <span className="block text-xs text-muted">
          {fecha(r.seen_at)}
          {r.url && (
            <a href={r.url} target="_blank" rel="noreferrer" className="ml-2 text-accent hover:underline">
              Ver
            </a>
          )}
        </span>
      </span>
    </li>
  );
}

function OpenList({
  rows,
  cardMap,
  player,
  title = "A la venta en Vinted ahora",
}: {
  rows: Row[];
  cardMap: Map<string, CatalogCard>;
  player: string;
  title?: string;
}) {
  const search = `https://www.vinted.es/catalog?search_text=${encodeURIComponent(`${player} topps`)}&price_from=10&currency=EUR&order=newest_first`;
  return (
    <section className="mt-6 overflow-hidden rounded-3xl bg-card shadow-card">
      <div className="flex items-baseline justify-between px-5 pt-5">
        <h2 className="font-semibold">{title}</h2>
        <a href={search} target="_blank" rel="noreferrer" className="text-sm text-accent hover:underline">
          Buscar en Vinted ↗
        </a>
      </div>
      {rows.length ? (
        <ul className="mt-3 divide-y divide-line">
          {rows.slice(0, 15).map((r) => (
            <Item key={r.external_id} r={r} c={cardMap.get(r.card_id)!} />
          ))}
        </ul>
      ) : (
        <p className="px-5 py-8 text-sm text-muted">Ningún anuncio de ≥10 € visto en las últimas {OPEN_HOURS} horas.</p>
      )}
    </section>
  );
}
