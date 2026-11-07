"use client";

import { useMemo, useState } from "react";

export interface SalePoint {
  t: number; // ms
  y: number; // €
  title: string;
  url: string | null;
  photo: string | null;
}

const W = 760;
const H = 320;
const PAD = { top: 18, right: 18, bottom: 54, left: 62 };

const eur = (n: number) => `${n.toLocaleString("es-ES", { minimumFractionDigits: n < 100 ? 2 : 0, maximumFractionDigits: n < 100 ? 2 : 0 })} €`;
const dayShort = (t: number) => new Date(t).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
const dayLong = (t: number) => new Date(t).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });

function niceTicks(max: number, count = 8): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const t = [];
  for (let v = 0; v <= max + step * 0.001; v += step) t.push(Math.round(v * 100) / 100);
  if (t[t.length - 1] < max * 1.05) t.push(Math.round((t[t.length - 1] + step) * 100) / 100);
  return t;
}

/** Curva suave que no se pasa de los puntos (interpolación monótona, Fritsch–Carlson). */
function smoothPath(p: { x: number; y: number }[]): string {
  if (p.length === 0) return "";
  if (p.length === 1) return `M${p[0].x},${p[0].y}`;
  const n = p.length;
  const d: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((p[i + 1].y - p[i].y) / Math.max(p[i + 1].x - p[i].x, 1e-6));
  m.push(d[0]);
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      m[i] = k * a * d[i];
      m[i + 1] = k * b * d[i];
    }
  }
  let out = `M${p[0].x.toFixed(1)},${p[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = (p[i + 1].x - p[i].x) / 3;
    out += `C${(p[i].x + h).toFixed(1)},${(p[i].y + m[i] * h).toFixed(1)} ${(p[i + 1].x - h).toFixed(1)},${(p[i + 1].y - m[i + 1] * h).toFixed(1)} ${p[i + 1].x.toFixed(1)},${p[i + 1].y.toFixed(1)}`;
  }
  return out;
}

/** Gráfica de las ventas registradas de una carta: línea suave + un punto por venta (clic = abrir anuncio). */
export default function SalesLineChart({ points, from, to }: { points: SalePoint[]; from: number; to: number }) {
  const [hover, setHover] = useState<number | null>(null);

  const g = useMemo(() => {
    const pts = [...points].sort((a, b) => a.t - b.t);
    const t0 = Math.min(from, pts[0]?.t ?? from);
    const t1 = Math.max(to, pts[pts.length - 1]?.t ?? to, t0 + 86400_000);
    const ticks = niceTicks(Math.max(...pts.map((p) => p.y), 1));
    const yMax = ticks[ticks.length - 1];
    const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
    const y = (v: number) => H - PAD.bottom - (v / yMax) * (H - PAD.top - PAD.bottom);
    // Marcas del eje X: como mucho 11, sin repetir el mismo día
    const n = Math.max(1, Math.min(10, Math.round((t1 - t0) / 86400_000)));
    const seen = new Set<string>();
    const xTicks = Array.from({ length: n + 1 }, (_, i) => t0 + ((t1 - t0) * i) / n).filter((t) => {
      const k = dayShort(t);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const xy = pts.map((p) => ({ x: x(p.t), y: y(p.y) }));
    return { pts, x, y, ticks, xTicks, path: smoothPath(xy) };
  }, [points, from, to]);

  const h = hover !== null ? g.pts[hover] : null;

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = -1;
    let bd = Infinity;
    g.pts.forEach((p, i) => {
      const d = Math.abs(g.x(p.t) - px);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    setHover(best >= 0 && bd < 50 ? best : null);
  };

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Gráfica de ventas">
        {g.ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={g.y(v)} y2={g.y(v)} stroke="var(--color-line)" strokeWidth={1} />
            <text x={PAD.left - 8} y={g.y(v)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--color-muted)">
              {eur(v)}
            </text>
          </g>
        ))}
        {g.xTicks.map((t, i) => (
          <g key={i}>
            <line x1={g.x(t)} x2={g.x(t)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--color-line)" strokeWidth={1} />
            <text
              x={g.x(t)}
              y={H - PAD.bottom + 14}
              textAnchor="end"
              fontSize={10.5}
              fill="var(--color-muted)"
              transform={`rotate(-40 ${g.x(t)} ${H - PAD.bottom + 14})`}
            >
              {dayShort(t)}
            </text>
          </g>
        ))}
        {g.pts.length === 1 && (
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={g.y(g.pts[0].y)}
            y2={g.y(g.pts[0].y)}
            stroke="var(--color-good)"
            strokeDasharray="4 4"
            opacity={0.5}
          />
        )}
        <path d={g.path} fill="none" stroke="var(--color-good)" strokeWidth={2.5} strokeLinecap="round" />
        {g.pts.map((p, i) => (
          <circle
            key={i}
            cx={g.x(p.t)}
            cy={g.y(p.y)}
            r={hover === i ? 6.5 : 4}
            fill="var(--color-good)"
            stroke="var(--color-card)"
            strokeWidth={2}
          />
        ))}
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
      {h && (
        <div
          className="pointer-events-none absolute z-10 flex w-[260px] gap-3 rounded-xl bg-ink p-2.5 text-xs text-white shadow-lg"
          style={{
            left: `${(g.x(h.t) / W) * 100}%`,
            top: `${Math.min((g.y(h.y) / H) * 100, 50)}%`,
            transform: g.x(h.t) > W * 0.6 ? "translateX(calc(-100% - 12px))" : "translateX(12px)",
          }}
        >
          {h.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={h.photo} alt="" className="h-20 w-14 shrink-0 rounded-md bg-white/10 object-cover" />
          ) : null}
          <div className="min-w-0">
            <p className="text-sm font-semibold">{eur(h.y)}</p>
            <p className="text-white/60">{dayLong(h.t)}</p>
            <p className="mt-1 line-clamp-3 text-white/80">{h.title}</p>
          </div>
        </div>
      )}
    </div>
  );
}
