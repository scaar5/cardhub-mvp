"use client";

import { useMemo, useState } from "react";

export interface PricePoint {
  t: number; // ms
  y: number; // €
  kind: "sale" | "ebay";
  title: string;
  detail: string; // carta + paralela
  url: string | null;
  photo: string | null;
}

const W = 760;
const H = 300;
const PAD = { top: 16, right: 16, bottom: 30, left: 60 };

const eur = (n: number) => `${n.toLocaleString("es-ES", { maximumFractionDigits: n < 100 ? 2 : 0 })} €`;
const day = (t: number) => new Date(t).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
const dayLong = (t: number) => new Date(t).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Mediana por semana (línea de tendencia). */
function weekly(points: PricePoint[]) {
  const WEEK = 7 * 86400_000;
  const b = new Map<number, number[]>();
  for (const p of points) {
    const k = Math.floor(p.t / WEEK);
    b.set(k, [...(b.get(k) ?? []), p.y]);
  }
  return [...b.entries()].sort((a, c) => a[0] - c[0]).map(([k, v]) => ({ t: k * WEEK + WEEK / 2, y: median(v) }));
}

function linearTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const t = [];
  for (let v = 0; v <= max + step * 0.001; v += step) t.push(Math.round(v * 100) / 100);
  if (t[t.length - 1] < max) t.push(t[t.length - 1] + step);
  return t;
}

function logTicks(min: number, max: number): number[] {
  const out: number[] = [];
  for (let e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e++)
    for (const m of [1, 2, 5]) {
      const v = m * 10 ** e;
      if (v >= min / 1.01 && v <= max * 1.01) out.push(v);
    }
  return out;
}

/**
 * Gráfica de precios de un jugador: ventas reales de Vinted (puntos azules + línea de mediana semanal)
 * y anuncios de eBay (puntos naranjas huecos, precio pedido). Si los precios van de pocos euros a cientos,
 * usa escala logarítmica para que se vean todos.
 */
export default function PlayerChart({ points }: { points: PricePoint[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const g = useMemo(() => {
    const pts = [...points].filter((p) => p.y > 0).sort((a, b) => a.t - b.t);
    const t0 = pts[0]?.t ?? Date.now();
    let t1 = pts[pts.length - 1]?.t ?? t0;
    if (t1 - t0 < 86400_000) t1 = t0 + 86400_000;
    const ys = pts.map((p) => p.y);
    const lo = Math.min(...ys);
    const hi = Math.max(...ys);
    const log = pts.length > 1 && hi / Math.max(lo, 0.5) > 25;
    let ticks: number[];
    let y: (v: number) => number;
    const innerH = H - PAD.top - PAD.bottom;
    if (log) {
      const a = 10 ** Math.floor(Math.log10(Math.max(lo, 0.5)));
      const b = 10 ** Math.ceil(Math.log10(hi));
      ticks = logTicks(a, b);
      y = (v) => H - PAD.bottom - ((Math.log10(Math.max(v, a)) - Math.log10(a)) / (Math.log10(b) - Math.log10(a))) * innerH;
    } else {
      ticks = linearTicks(hi);
      const yMax = ticks[ticks.length - 1];
      y = (v) => H - PAD.bottom - (v / yMax) * innerH;
    }
    const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
    const line = (arr: { t: number; y: number }[]) =>
      arr.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.y).toFixed(1)}`).join("");
    const sales = pts.filter((p) => p.kind === "sale");
    const ebay = pts.filter((p) => p.kind === "ebay");
    const xTicks = Array.from({ length: 5 }, (_, i) => t0 + ((t1 - t0) * i) / 4);
    return {
      pts,
      x,
      y,
      ticks,
      xTicks,
      log,
      saleLine: sales.length >= 2 ? line(weekly(sales)) : "",
      ebayLine: ebay.length >= 2 ? line(weekly(ebay)) : "",
    };
  }, [points]);

  if (!g.pts.length) return null;
  const h = hover !== null ? g.pts[hover] : null;

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const py = ((e.clientY - r.top) / r.height) * H;
    let best = 0;
    let bd = Infinity;
    g.pts.forEach((p, i) => {
      const d = (g.x(p.t) - px) ** 2 + (g.y(p.y) - py) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    setHover(bd < 60 ** 2 ? best : null);
  };

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Gráfica de precios del jugador">
        {g.ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={g.y(v)} y2={g.y(v)} stroke="var(--color-line)" strokeWidth={1} />
            <text x={PAD.left - 8} y={g.y(v)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--color-faint)">
              {eur(v)}
            </text>
          </g>
        ))}
        {g.xTicks.map((t, i) => (
          <text
            key={i}
            x={g.x(t)}
            y={H - 10}
            textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"}
            fontSize={11}
            fill="var(--color-faint)"
          >
            {day(t)}
          </text>
        ))}
        {g.ebayLine && (
          <path d={g.ebayLine} fill="none" stroke="var(--color-warn)" strokeWidth={1.5} strokeDasharray="4 4" opacity={0.7} />
        )}
        {g.pts.map((p, i) =>
          p.kind === "ebay" ? (
            <circle key={i} cx={g.x(p.t)} cy={g.y(p.y)} r={3.5} fill="var(--color-card)" stroke="var(--color-warn)" strokeWidth={1.5} opacity={0.75} />
          ) : null,
        )}
        {g.saleLine && <path d={g.saleLine} fill="none" stroke="var(--color-accent)" strokeWidth={2.5} strokeLinejoin="round" />}
        {g.pts.map((p, i) =>
          p.kind === "sale" ? (
            <circle key={i} cx={g.x(p.t)} cy={g.y(p.y)} r={5} fill="var(--color-accent)" stroke="var(--color-card)" strokeWidth={2} />
          ) : null,
        )}
        {h && (
          <circle
            cx={g.x(h.t)}
            cy={g.y(h.y)}
            r={8}
            fill="none"
            stroke={h.kind === "sale" ? "var(--color-accent)" : "var(--color-warn)"}
            strokeWidth={2}
            pointerEvents="none"
          />
        )}
        <rect
          x={0}
          y={0}
          width={W}
          height={H}
          fill="transparent"
          style={{ cursor: h?.url ? "pointer" : "default" }}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          onClick={() => {
            if (h?.url) window.open(h.url, "_blank", "noopener");
          }}
        />
      </svg>
      {g.log && <p className="mt-1 text-right text-[11px] text-faint">Escala logarítmica (precios muy distintos entre sí)</p>}
      {h && (
        <div
          className="pointer-events-none absolute z-10 flex w-[280px] gap-3 rounded-xl bg-ink p-2.5 text-xs text-white shadow-lg"
          style={{
            left: `${(g.x(h.t) / W) * 100}%`,
            top: `${Math.min((g.y(h.y) / H) * 100, 55)}%`,
            transform: g.x(h.t) > W * 0.6 ? "translateX(calc(-100% - 12px))" : "translateX(12px)",
          }}
        >
          {h.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={h.photo} alt="" className="h-20 w-14 shrink-0 rounded-md bg-white/10 object-cover" />
          ) : null}
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {eur(h.y)}{" "}
              <span className={`font-normal ${h.kind === "sale" ? "text-white/70" : "text-amber-300"}`}>
                {h.kind === "sale" ? "· vendida en Vinted" : "· pedido en eBay"}
              </span>
            </p>
            <p className="text-white/60">{dayLong(h.t)}</p>
            <p className="mt-1 text-white/90">{h.detail}</p>
            <p className="mt-1 line-clamp-2 text-white/60">{h.title}</p>
            {h.url && <p className="mt-1 text-white/50">Haz clic para abrir el anuncio</p>}
          </div>
        </div>
      )}
    </div>
  );
}
