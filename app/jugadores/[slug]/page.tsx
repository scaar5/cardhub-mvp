import Link from "next/link";
import { notFound } from "next/navigation";
import PlayerChart, { type PricePoint } from "@/components/PlayerChart";
import PlayerSearch from "@/components/PlayerSearch";
import type { CatalogCard } from "@/lib/catalog";
import { fetchAll } from "@/lib/fetch-all";
import { median } from "@/lib/market";
import { photoPublicUrl } from "@/lib/photo-url";
import { cardSet, playerBySlug } from "@/lib/players";
import { getSupabase } from "@/lib/supabase";

export const revalidate = 300;

type Params = Promise<{ slug: string }>;
type Search = Promise<{ card?: string; par?: string; dias?: string; ebay?: string }>;

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
  [30, "30 días"],
  [90, "90 días"],
  [180, "6 meses"],
  [365, "1 año"],
  [0, "Todo"],
] as const;
const MAX_EBAY_POINTS = 400;

const eur = (n: number) => `${n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const fecha = (s: string) => new Date(s).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
const parKey = (p: string | null) => p ?? "base";
const parLabel = (k: string) => (k === "base" ? "Base" : k);
const itemId = (s: string) => s.match(/(\d{6,})/)?.[1] ?? s;

export async function generateMetadata({ params }: { params: Params }) {
  const { slug } = await params;
  const p = playerBySlug.get(slug);
  return { title: p ? `${p.name} — precios y ventas — sCARDs` : "Jugador — sCARDs" };
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
            .in("platform", ["vinted_sold", "vinted_gone", "vinted", "ebay"])
            .order("seen_at", { ascending: false })
            .range(from, to),
        20_000,
      ),
    ),
  );
  return parts.flatMap((p) => p.data).map((r) => ({ ...r, price: Number(r.price) }));
}

export default async function JugadorPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { slug } = await params;
  const player = playerBySlug.get(slug);
  if (!player) notFound();
  const sp = await searchParams;

  const cardMap = new Map(player.cards.map((c) => [c.id, c]));
  const card = sp.card && cardMap.has(sp.card) ? sp.card : "";
  const dias = PERIODS.some(([d]) => String(d) === sp.dias) ? Number(sp.dias) : 0;
  const showEbay = sp.ebay !== "0";

  const all = await loadRows(player.cards.map((c) => c.id));

  // Clasificar: ventas, eBay y anuncios de Vinted abiertos (vistos hace poco y sin venta/desaparición)
  const closed = new Set(all.filter((r) => r.platform === "vinted_sold" || r.platform === "vinted_gone").map((r) => itemId(r.external_id)));
  const openSince = Date.now() - OPEN_HOURS * 3600_000;
  const salesAll = all.filter((r) => r.platform === "vinted_sold");
  const ebayAll = all.filter((r) => r.platform === "ebay");
  const openAll = all.filter(
    (r) => r.platform === "vinted" && Date.parse(r.seen_at) >= openSince && !closed.has(itemId(r.external_id)),
  );

  // Paralelas disponibles para el filtro (de la carta elegida, o de todas)
  const byCard = (r: Row) => !card || r.card_id === card;
  const parCount = new Map<string, number>();
  for (const r of [...salesAll, ...ebayAll, ...openAll].filter(byCard)) parCount.set(parKey(r.parallel), (parCount.get(parKey(r.parallel)) ?? 0) + 1);
  const pars = [...parCount.entries()].sort((a, b) => (a[0] === "base" ? -1 : b[0] === "base" ? 1 : b[1] - a[1]));
  const par = sp.par && parCount.has(sp.par) ? sp.par : "";

  const match = (r: Row) => byCard(r) && (!par || parKey(r.parallel) === par);
  const since = dias ? Date.now() - dias * 86400_000 : 0;
  const inPeriod = (r: Row) => Date.parse(r.seen_at) >= since;

  const sales = salesAll.filter(match);
  const ebay = ebayAll.filter(match);
  const open = openAll.filter(match).sort((a, b) => a.price - b.price);

  // --- Resumen (punto 5)
  const saleAgo = (d: number) => sales.filter((r) => Date.parse(r.seen_at) >= Date.now() - d * 86400_000).map((r) => r.price);
  const last = sales[0];
  const m30 = saleAgo(30);
  const m90 = saleAgo(90);
  const salesPeriod = sales.filter(inPeriod);

  // --- Gráfica
  const describe = (r: Row) => {
    const c = cardMap.get(r.card_id)!;
    return `${cardSet(c).name} #${c.number}${c.subset !== "Base" ? ` ${c.subset}` : ""} · ${parLabel(parKey(r.parallel))}`;
  };
  const toPoint = (r: Row, kind: PricePoint["kind"]): PricePoint => ({
    t: Date.parse(r.seen_at),
    y: r.price,
    kind,
    title: r.title,
    detail: describe(r),
    url: r.url,
    photo: photoPublicUrl(r.photo_path) ?? r.photo_url ?? null,
  });
  const ebayPeriod = ebay.filter(inPeriod);
  const points: PricePoint[] = [
    ...salesPeriod.map((r) => toPoint(r, "sale")),
    ...(showEbay ? ebayPeriod.slice(0, MAX_EBAY_POINTS).map((r) => toPoint(r, "ebay")) : []),
  ];

  // --- Ficha: cartas agrupadas por colección (punto 2)
  const stat = new Map<string, { sales: number[]; ebay: number; open: number }>();
  for (const c of player.cards) stat.set(c.id, { sales: [], ebay: 0, open: 0 });
  for (const r of salesAll) stat.get(r.card_id)?.sales.push(r.price);
  for (const r of ebayAll) stat.get(r.card_id)!.ebay++;
  for (const r of openAll) stat.get(r.card_id)!.open++;
  const groups = new Map<string, { name: string; season: string; cards: CatalogCard[] }>();
  for (const c of player.cards) {
    const s = cardSet(c);
    const g = groups.get(c.set_slug) ?? { name: s.name, season: s.season, cards: [] };
    g.cards.push(c);
    groups.set(c.set_slug, g);
  }
  const groupList = [...groups.entries()].sort((a, b) => b[1].season.localeCompare(a[1].season) || a[1].name.localeCompare(b[1].name));

  const href = (o: { card?: string; par?: string; dias?: number; ebay?: boolean }) => {
    const u = new URLSearchParams();
    const c = o.card ?? card;
    const p = "par" in o ? o.par : par;
    const d = o.dias ?? dias;
    const e = o.ebay ?? showEbay;
    if (c) u.set("card", c);
    if (p) u.set("par", p);
    if (d) u.set("dias", String(d));
    if (!e) u.set("ebay", "0");
    const qs = u.toString();
    return `/jugadores/${slug}${qs ? `?${qs}` : ""}#grafica`;
  };
  const selCard = card ? cardMap.get(card)! : null;
  const vintedSearch = `https://www.vinted.es/catalog?search_text=${encodeURIComponent(`${player.name} topps`)}&price_from=10&currency=EUR&order=newest_first`;
  const chip = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-xs font-medium ${active ? "bg-ink text-white" : "bg-canvas text-muted hover:text-ink"}`;

  return (
    <main className="mx-auto max-w-5xl px-5 pb-16 pt-6">
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

      <h1 className="mt-8 text-3xl font-semibold tracking-tight">
        {player.name}
        {player.rookie && (
          <span className="ml-3 align-middle rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">Tiene RC</span>
        )}
      </h1>
      <p className="mt-2 text-[15px] text-muted">
        {player.teams.join(" · ")} · {player.cards.length} cartas en {groups.size} colecciones
      </p>

      {/* Resumen */}
      <p className="mt-6 text-xs text-muted">
        {selCard ? `${cardSet(selCard).name} #${selCard.number}${selCard.subset !== "Base" ? ` ${selCard.subset}` : ""}` : "Todas sus cartas"}
        {" · "}
        {par ? parLabel(par) : "todas las variantes"}
        {!card && !par && " (ojo: mezcla bases, numeradas y firmas; elige una carta para un precio fiable)"}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-3xl bg-card p-4 shadow-card">
          <p className="text-xs text-muted">Última venta</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{last ? eur(last.price) : "—"}</p>
          {last && <p className="mt-0.5 truncate text-xs text-faint">{fecha(last.seen_at)} · {parLabel(parKey(last.parallel))}</p>}
        </div>
        <div className="rounded-3xl bg-card p-4 shadow-card">
          <p className="text-xs text-muted">Mediana 30 días</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{m30.length ? eur(median(m30)) : "—"}</p>
          <p className="mt-0.5 text-xs text-faint">{m30.length} ventas</p>
        </div>
        <div className="rounded-3xl bg-card p-4 shadow-card">
          <p className="text-xs text-muted">Mediana 90 días</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{m90.length ? eur(median(m90)) : "—"}</p>
          <p className="mt-0.5 text-xs text-faint">{m90.length} ventas</p>
        </div>
        <div className="rounded-3xl bg-card p-4 shadow-card">
          <p className="text-xs text-muted">Ventas registradas</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{sales.length}</p>
          <p className="mt-0.5 text-xs text-faint">{ebay.length} anuncios en eBay</p>
        </div>
        <div className="rounded-3xl bg-card p-4 shadow-card">
          <p className="text-xs text-muted">En Vinted ahora</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{open.length}</p>
          <p className="mt-0.5 text-xs text-faint">{open.length ? `desde ${eur(open[0].price)}` : "≥10 €"}</p>
        </div>
      </div>

      {/* Gráfica */}
      <section id="grafica" className="mt-6 scroll-mt-4 rounded-3xl bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Precio en el tiempo</h2>
          <div className="flex flex-wrap gap-1.5">
            {PERIODS.map(([d, label]) => (
              <Link key={d} href={href({ dias: d })} className={chip(dias === d)} scroll={false}>
                {label}
              </Link>
            ))}
            <Link href={href({ ebay: !showEbay })} className={chip(showEbay)} scroll={false}>
              {showEbay ? "✓ " : ""}eBay
            </Link>
          </div>
        </div>

        {pars.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Link href={href({ par: "" })} className={chip(!par)} scroll={false}>
              Todas las variantes
            </Link>
            {pars.slice(0, 20).map(([k, n]) => (
              <Link key={k} href={href({ par: k })} className={chip(par === k)} scroll={false}>
                {parLabel(k)} <span className="opacity-60">· {n}</span>
              </Link>
            ))}
          </div>
        )}
        {card && (
          <p className="mt-3 text-sm">
            Carta: <strong>{selCard!.number && `#${selCard!.number}`} {cardSet(selCard!).name}</strong>{" "}
            <Link href={href({ card: "", par: "" })} className="ml-1 text-accent hover:underline">
              (ver todas)
            </Link>
          </p>
        )}

        <div className="mt-4">
          {points.length ? (
            <PlayerChart points={points} />
          ) : (
            <p className="py-12 text-center text-sm text-muted">
              Todavía no hay ventas{showEbay ? " ni anuncios de eBay" : ""} de {card ? "esta carta" : "este jugador"} en este
              periodo. La vigilancia de Vinted las irá apuntando.
            </p>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-accent" /> Venta real en Vinted (línea = mediana semanal)
          </span>
          {showEbay && (
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full border-2 border-warn" /> Anuncio en eBay ES/DE: precio pedido, no vendido
            </span>
          )}
        </div>
      </section>

      {/* Ventas y anuncios abiertos */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="overflow-hidden rounded-3xl bg-card shadow-card">
          <h2 className="px-5 pt-5 font-semibold">Últimas ventas</h2>
          {sales.length ? (
            <ul className="mt-3 divide-y divide-line">
              {sales.slice(0, 30).map((s) => (
                <SaleItem key={s.external_id} r={s} detail={describe(s)} />
              ))}
            </ul>
          ) : (
            <p className="px-5 py-8 text-sm text-muted">Sin ventas registradas todavía.</p>
          )}
        </section>
        <section className="overflow-hidden rounded-3xl bg-card shadow-card">
          <div className="flex items-baseline justify-between px-5 pt-5">
            <h2 className="font-semibold">A la venta en Vinted (más baratos)</h2>
            <a href={vintedSearch} target="_blank" rel="noreferrer" className="text-sm text-accent hover:underline">
              Buscar en Vinted ↗
            </a>
          </div>
          {open.length ? (
            <ul className="mt-3 divide-y divide-line">
              {open.slice(0, 15).map((s) => (
                <SaleItem key={s.external_id} r={s} detail={describe(s)} />
              ))}
            </ul>
          ) : (
            <p className="px-5 py-8 text-sm text-muted">Ningún anuncio de ≥10 € visto en las últimas {OPEN_HOURS} horas.</p>
          )}
        </section>
      </div>

      {/* Ficha: todas sus cartas */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">Sus cartas en el catálogo</h2>
        <p className="mt-1 text-sm text-muted">Pulsa una carta para ver solo su gráfica.</p>
        <div className="mt-4 space-y-3">
          {groupList.map(([setSlug, g], i) => (
            <details key={setSlug} open={i < 4 || g.cards.some((c) => c.id === card)} className="rounded-3xl bg-card shadow-card">
              <summary className="cursor-pointer list-none px-5 py-4">
                <span className="font-semibold">{g.name}</span>
                <span className="ml-2 text-sm text-muted">
                  {g.cards.length} {g.cards.length === 1 ? "carta" : "cartas"} ·{" "}
                  {g.cards.reduce((a, c) => a + stat.get(c.id)!.sales.length, 0)} ventas
                </span>
              </summary>
              <ul className="divide-y divide-line border-t border-line">
                {g.cards
                  .sort((a, b) => a.number.localeCompare(b.number, "es", { numeric: true }))
                  .map((c) => {
                    const s = stat.get(c.id)!;
                    return (
                      <li key={c.id}>
                        <Link
                          href={href({ card: c.id, par: "" })}
                          className={`flex items-center justify-between gap-3 px-5 py-2.5 text-sm hover:bg-canvas ${c.id === card ? "bg-accent-soft" : ""}`}
                        >
                          <span className="min-w-0">
                            <span className="font-medium">#{c.number}</span>{" "}
                            <span className="text-muted">{c.subset}</span>
                            {c.rookie && (
                              <span className="ml-2 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">RC</span>
                            )}
                            {c.team && <span className="ml-2 text-xs text-faint">{c.team}</span>}
                          </span>
                          <span className="shrink-0 text-right text-xs tabular-nums text-muted">
                            {s.sales.length ? (
                              <>
                                <strong className="text-ink">{s.sales.length}</strong> ventas · mediana{" "}
                                <strong className="text-ink">{eur(median(s.sales))}</strong>
                              </>
                            ) : (
                              <span className="text-faint">sin ventas</span>
                            )}
                            <span className="block text-faint">
                              {s.open} en Vinted · {s.ebay} en eBay
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
              </ul>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}

function SaleItem({ r, detail }: { r: Row; detail: string }) {
  const photo = photoPublicUrl(r.photo_path) ?? r.photo_url;
  return (
    <li className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
      <span className="flex min-w-0 items-center gap-3">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" loading="lazy" className="h-14 w-10 shrink-0 rounded-md bg-line object-cover" />
        ) : (
          <span className="h-14 w-10 shrink-0 rounded-md bg-line" />
        )}
        <span className="min-w-0">
          <span className="block truncate text-xs text-muted">{detail}</span>
          <span className="block truncate">{r.title}</span>
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
