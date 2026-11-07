import Link from "next/link";
import PlayerSearch from "@/components/PlayerSearch";
import { CARDS } from "@/lib/catalog";
import { PLAYERS, playerSlug, searchPlayers } from "@/lib/players";
import { getSupabase } from "@/lib/supabase";

export const metadata = { title: "Jugadores — sCARDs" };
export const revalidate = 300;

type Params = Promise<{ q?: string }>;

const cardById = new Map(CARDS.map((c) => [c.id, c]));

export default async function JugadoresPage({ searchParams }: { searchParams: Params }) {
  const { q = "" } = await searchParams;
  const results = q ? searchPlayers(q, 40) : [];

  // Jugadores con más ventas registradas (para empezar sin buscar)
  let top: { slug: string; name: string; sales: number }[] = [];
  if (!q) {
    const db = getSupabase();
    if (db) {
      const { data } = await db.from("listings").select("card_id").eq("platform", "vinted_sold").limit(5000);
      const count = new Map<string, { name: string; sales: number }>();
      for (const r of data ?? []) {
        const c = r.card_id ? cardById.get(r.card_id) : undefined;
        if (!c) continue;
        const s = playerSlug(c.player);
        const e = count.get(s) ?? { name: c.player, sales: 0 };
        e.sales++;
        count.set(s, e);
      }
      top = [...count.entries()]
        .map(([slug, e]) => ({ slug, ...e }))
        .sort((a, b) => b.sales - a.sales)
        .slice(0, 18);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-5 pb-16 pt-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 rounded-full bg-card px-3.5 py-1.5 text-sm text-muted shadow-card hover:text-ink"
      >
        ← Inicio
      </Link>

      <h1 className="mt-8 text-3xl font-semibold tracking-tight">Jugadores</h1>
      <p className="mt-2 max-w-2xl text-[15px] text-muted">
        {PLAYERS.length.toLocaleString("es-ES")} jugadores del catálogo. Elige uno para ver todas sus cartas, sus ventas
        reales en Vinted y los precios pedidos en eBay, en una gráfica.
      </p>

      <div className="mt-6">
        <PlayerSearch initial={q} autoFocus />
      </div>

      {q && (
        <section className="mt-6 overflow-hidden rounded-3xl bg-card shadow-card">
          {results.length ? (
            <ul className="divide-y divide-line">
              {results.map((p) => (
                <li key={p.slug}>
                  <Link href={`/jugadores/${p.slug}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-canvas">
                    <span className="min-w-0">
                      <span className="font-semibold">{p.name}</span>
                      {p.rookie && (
                        <span className="ml-2 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                          RC
                        </span>
                      )}
                      <span className="block truncate text-xs text-muted">{p.teams.join(" · ")}</span>
                    </span>
                    <span className="shrink-0 text-sm text-muted">{p.cards.length} cartas</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-muted">No hay ningún jugador con ese nombre en el catálogo.</p>
          )}
        </section>
      )}

      {!q && top.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-muted">Con más ventas registradas</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {top.map((p) => (
              <Link
                key={p.slug}
                href={`/jugadores/${p.slug}`}
                className="rounded-full bg-card px-4 py-2 text-sm shadow-card hover:text-accent"
              >
                {p.name} <span className="text-faint">· {p.sales}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
