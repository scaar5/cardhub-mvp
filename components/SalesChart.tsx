"use client";

import { useMemo, useState } from "react";

export interface ChartPoint {
  t: number; // ms
  y: number;
  label?: string; // texto extra del tooltip
}

const W = 760;
const H = 260;
const PAD = { top: 16, right: 16, bottom: 30, left: 56 };

const eur = (n: number) => `${n.toLocaleString("es-ES", { maximumFractionDigits: n < 100 ? 2 : 0 })} €`;
const day = (t: number) => new Date(t).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
const dayLong = (t: number) =>
  new Date(t).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });

function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const ticks = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(Math.round(v * 100) / 100);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

/** Gráfica de una sola serie (precio de venta o ventas acumuladas) con cruz y tooltip al pasar el ratón. */
export default function SalesChart({
  points,
  format,
  step = false,
}: {
  points: ChartPoint[];
  format: "eur" | "count";
  step?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const fmt = format === "eur" ? eur : (n: number) => n.toLocaleString("es-ES");

  const g = useMemo(() => {
    const pts = [...points].sort((a, b) => a.t - b.t);
    const t0 = pts[0]?.t ?? Date.now();
    let t1 = pts[pts.length - 1]?.t ?? t0;
    if (t1 - t0 < 86400_000) t1 = t0 + 86400_000;
    const ticks = niceTicks(Math.max(...pts.map((p) => p.y), 0));
    const yMax = ticks[ticks.length - 1];
    const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
    const y = (v: number) => H - PAD.bottom - (v / yMax) * (H - PAD.top - PAD.bottom);
    let d = "";
    pts.forEach((p, i) => {
      if (i === 0) d += `M${x(p.t)},${y(p.y)}`;
      else if (step) d += `H${x(p.t)}V${y(p.y)}`;
      else d += `L${x(p.t)},${y(p.y)}`;
    });
    const xTicks = Array.from({ length: 5 }, (_, i) => t0 + ((t1 - t0) * i) / 4);
    return { pts, x, y, d, ticks, xTicks };
  }, [points, step]);

  if (g.pts.length === 0) return null;
  const h = hover !== null ? g.pts[hover] : null;

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * (W - PAD.left - PAD.right) + PAD.left;
    let best = 0;
    g.pts.forEach((p, i) => {
      if (Math.abs(g.x(p.t) - px) < Math.abs(g.x(g.pts[best].t) - px)) best = i;
    });
    setHover(best);
  };

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Gráfica de ventas">
        {g.ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={g.y(v)} y2={g.y(v)} stroke="var(--color-line)" strokeWidth={1} />
            <text x={PAD.left - 8} y={g.y(v)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--color-faint)">
              {fmt(v)}
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
        <path d={g.d} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeLinejoin="round" />
        {g.pts.length <= 60 &&
          g.pts.map((p, i) => (
            <circle
              key={i}
              cx={g.x(p.t)}
              cy={g.y(p.y)}
              r={4}
              fill="var(--color-accent)"
              stroke="var(--color-card)"
              strokeWidth={2}
            />
          ))}
        {h && (
          <g pointerEvents="none">
            <line
              x1={g.x(h.t)}
              x2={g.x(h.t)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="var(--color-faint)"
              strokeDasharray="3 3"
            />
            <circle cx={g.x(h.t)} cy={g.y(h.y)} r={6} fill="var(--color-accent)" stroke="var(--color-card)" strokeWidth={2} />
          </g>
        )}
        <rect
          x={PAD.left}
          y={0}
          width={W - PAD.left - PAD.right}
          height={H}
          fill="transparent"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {h && (
        <div
          className="pointer-events-none absolute top-2 z-10 max-w-[240px] rounded-xl bg-ink px-3 py-2 text-xs text-white shadow-lg"
          style={{
            left: `${(g.x(h.t) / W) * 100}%`,
            transform: g.x(h.t) > W * 0.65 ? "translateX(calc(-100% - 10px))" : "translateX(10px)",
          }}
        >
          <p className="font-semibold">{fmt(h.y)}</p>
          <p className="text-white/70">{dayLong(h.t)}</p>
          {h.label && <p className="mt-1 text-white/90">{h.label}</p>}
        </div>
      )}
    </div>
  );
}
