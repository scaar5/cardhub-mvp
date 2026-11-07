"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface Hit {
  slug: string;
  name: string;
  team: string | null;
  cards: number;
  rookie: boolean;
  seasons: string;
}

/** Buscador de jugadores con autocompletado (consulta /api/players). */
export default function PlayerSearch({ initial = "", autoFocus = false }: { initial?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/players?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const j = await r.json();
        setHits(j.results ?? []);
        setActive(0);
      } catch {
        /* cancelada */
      }
    }, 150);
    return () => ctrl.abort();
  }, [q]);

  const go = (slug: string) => {
    setOpen(false);
    router.push(`/jugadores/${slug}`);
  };

  return (
    <form
      action="/jugadores"
      className="relative"
      onSubmit={(e) => {
        if (open && hits[active]) {
          e.preventDefault();
          go(hits[active].slug);
        }
      }}
    >
      <div className="flex gap-2">
        <input
          name="q"
          value={q}
          autoFocus={autoFocus}
          autoComplete="off"
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (!hits.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, hits.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Busca un jugador: Yamal, Bellingham, Vini…"
          className="min-w-0 flex-1 rounded-2xl bg-card px-4 py-3 text-[15px] shadow-card outline-none ring-accent/30 placeholder:text-faint focus:ring-2"
        />
        <button className="rounded-2xl bg-ink px-5 py-3 text-sm font-semibold text-white">Buscar</button>
      </div>
      {open && hits.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl bg-card shadow-lg ring-1 ring-line">
          {hits.map((h, i) => (
            <li key={h.slug}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(h.slug)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm ${i === active ? "bg-canvas" : ""}`}
              >
                <span className="min-w-0">
                  <span className="font-semibold">{h.name}</span>
                  {h.rookie && (
                    <span className="ml-2 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">RC</span>
                  )}
                  <span className="block truncate text-xs text-muted">
                    {[h.team, h.seasons].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-faint">{h.cards} cartas</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
