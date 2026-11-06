import Link from "next/link";
import { CARDS, SETS, searchCards, setBySlug } from "@/lib/catalog";

export const metadata = { title: "Catálogo de cartas — sCARDs" };

type Params = Promise<{ q?: string; set?: string }>;

export default async function CartasPage({ searchParams }: { searchParams: Params }) {
  const { q = "", set = "" } = await searchParams;
  const activeSet = setBySlug.get(set) ? set : "";
  const { results, total } = searchCards(q, { set: activeSet || undefined, limit: 90 });

  const href = (s: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (s) p.set("set", s);
    const qs = p.toString();
    return qs ? `/cartas?${qs}` : "/cartas";
  };

  return (
    <main className="mx-auto max-w-5xl px-5 pb-16 pt-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 rounded-full bg-card px-3.5 py-1.5 text-sm text-muted shadow-card hover:text-ink"
      >
        ← Inicio
      </Link>

      <h1 className="mt-8 text-3xl font-semibold tracking-tight">Catálogo de cartas</h1>
      <p className="mt-2 text-[15px] text-muted">
        {CARDS.length.toLocaleString("es-ES")} cartas de {SETS.length} colecciones de Topps y Panini.
        Busca por jugador, equipo, colección o número.
      </p>

      <form action="/cartas" className="mt-6 flex gap-2">
        {activeSet && <input type="hidden" name="set" value={activeSet} />}
        <input
          name="q"
          defaultValue={q}
          placeholder="Ej.: Lamine Yamal, Bellingham refractor, Arsenal…"
          className="min-w-0 flex-1 rounded-2xl bg-card px-4 py-3 text-[15px] shadow-card outline-none ring-accent/30 placeholder:text-faint focus:ring-2"
        />
        <button className="rounded-2xl bg-ink px-5 py-3 text-sm font-semibold text-white">Buscar</button>
      </form>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={href("")}
          className={`rounded-full px-3 py-1.5 text-xs font-medium shadow-card ${!activeSet ? "bg-ink text-white" : "bg-card text-muted hover:text-ink"}`}
        >
          Todas
        </Link>
        {SETS.map((s) => (
          <Link
            key={s.slug}
            href={href(s.slug)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium shadow-card ${activeSet === s.slug ? "bg-ink text-white" : "bg-card text-muted hover:text-ink"}`}
          >
            {s.name.replace(/^(Topps|Panini) /, "")}{" "}
            <span className="opacity-60">{s.card_count}</span>
          </Link>
        ))}
      </div>

      <p className="mt-6 px-1 text-sm text-muted">
        {total.toLocaleString("es-ES")} {total === 1 ? "carta" : "cartas"}
        {total > results.length && ` · mostrando ${results.length}`}
      </p>

      {results.length ? (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((c) => {
            const s = setBySlug.get(c.set_slug)!;
            return (
              <li key={c.id} className="rounded-3xl bg-card p-4 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{c.player}</p>
                    <p className="truncate text-sm text-muted">{c.team}</p>
                  </div>
                  <span className="tabular shrink-0 rounded-full bg-canvas px-2.5 py-1 text-xs font-medium text-muted">
                    #{c.number}
                  </span>
                </div>
                <p className="mt-3 truncate text-xs text-faint">{s.name}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.subset !== "Base" && (
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
                      {c.subset}
                    </span>
                  )}
                  {c.rookie && (
                    <span className="rounded-full bg-good-soft px-2 py-0.5 text-[11px] font-medium text-good">
                      Rookie
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-3 rounded-3xl bg-card px-6 py-14 text-center shadow-card">
          <p className="text-base font-medium">No hay cartas que coincidan</p>
          <p className="mt-1 text-sm text-muted">Prueba solo con el apellido del jugador.</p>
        </div>
      )}
    </main>
  );
}
