"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Foto que se abre a pantalla completa al tocarla, con zoom:
 * - doble toque / doble clic o botones + / − para acercar,
 * - pellizco (móvil) o rueda del ratón,
 * - arrastrar para moverse con zoom.
 * `big` = foto original (más grande, p. ej. la de Vinted); si falla se usa `src`.
 */
export default function PhotoZoom({
  src,
  big,
  alt,
  className = "",
  thumbClassName = "",
}: {
  src: string;
  big?: string | null;
  alt: string;
  className?: string;
  thumbClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`group relative cursor-zoom-in ${className}`}
        aria-label="Ampliar foto"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className={thumbClassName} />
        <span className="pointer-events-none absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white opacity-80 transition group-hover:opacity-100">
          <Icon d="M10 4a6 6 0 1 0 3.9 10.6l4.8 4.8 1.4-1.4-4.8-4.8A6 6 0 0 0 10 4Zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm-1 1.5v2H7v1.5h2v2h1.5v-2h2V9.5h-2v-2H9Z" />
        </span>
      </button>
      {open && <Lightbox src={big || src} fallback={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}

const MIN = 1;
const MAX = 6;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function Lightbox({ src, fallback, alt, onClose }: { src: string; fallback: string; alt: string; onClose: () => void }) {
  const [url, setUrl] = useState(src);
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const boxRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; s: number; mid: { x: number; y: number }; vx: number; vy: number } | null>(null);
  const lastTap = useRef(0);
  const moved = useRef(false);
  const viewRef = useRef(view);
  viewRef.current = view;

  // Zoom manteniendo fijo el punto (cx, cy) de la pantalla.
  const zoomAt = useCallback((next: number, cx: number, cy: number) => {
    setView((v) => {
      const s = clamp(next, MIN, MAX);
      if (s === 1) return { s: 1, x: 0, y: 0 };
      const r = boxRef.current?.getBoundingClientRect();
      const ox = r ? cx - (r.left + r.width / 2) : 0;
      const oy = r ? cy - (r.top + r.height / 2) : 0;
      const k = s / v.s;
      return { s, x: ox - (ox - v.x) * k, y: oy - (oy - v.y) * k };
    });
  }, []);

  const center = () => {
    const r = boxRef.current?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: 0, y: 0 };
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "+" || e.key === "=") setView((v) => ({ ...v, s: clamp(v.s * 1.5, MIN, MAX) }));
      if (e.key === "-") setView((v) => (v.s / 1.5 <= 1 ? { s: 1, x: 0, y: 0 } : { ...v, s: v.s / 1.5 }));
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // La rueda necesita passive:false para poder evitar el scroll.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(viewRef.current.s * (e.deltaY < 0 ? 1.2 : 1 / 1.2), e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = false;
    const pts = [...pointers.current.values()];
    const v = viewRef.current;
    if (pts.length === 2) {
      gesture.current = {
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        s: v.s,
        mid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
        vx: v.x,
        vy: v.y,
      };
    } else {
      gesture.current = { dist: 0, s: v.s, mid: { x: e.clientX, y: e.clientY }, vx: v.x, vy: v.y };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    const pts = [...pointers.current.values()];
    if (pts.length >= 2 && g.dist) {
      moved.current = true;
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const s = clamp(g.s * (d / g.dist), MIN, MAX);
      const c = center();
      const ox = g.mid.x - c.x;
      const oy = g.mid.y - c.y;
      const k = s / g.s;
      const mx = (pts[0].x + pts[1].x) / 2 - g.mid.x;
      const my = (pts[0].y + pts[1].y) / 2 - g.mid.y;
      setView(s === 1 ? { s: 1, x: 0, y: 0 } : { s, x: ox - (ox - g.vx) * k + mx, y: oy - (oy - g.vy) * k + my });
    } else if (pts.length === 1 && viewRef.current.s > 1) {
      const dx = e.clientX - g.mid.x;
      const dy = e.clientY - g.mid.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved.current = true;
      setView((v) => ({ ...v, x: g.vx + dx, y: g.vy + dy }));
    } else if (Math.abs(e.clientX - g.mid.x) + Math.abs(e.clientY - g.mid.y) > 6) {
      moved.current = true;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const rest = [...pointers.current.values()];
    const v = viewRef.current;
    gesture.current = rest.length === 1 ? { dist: 0, s: v.s, mid: rest[0], vx: v.x, vy: v.y } : null;
    if (rest.length || moved.current) return;
    // Toque simple: doble toque = zoom; toque en el fondo = cerrar.
    const now = Date.now();
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      if (v.s > 1) setView({ s: 1, x: 0, y: 0 });
      else zoomAt(2.5, e.clientX, e.clientY);
    } else {
      lastTap.current = now;
      const onImage = (e.target as Element).tagName === "IMG";
      if (!onImage && v.s === 1) {
        setTimeout(() => {
          if (lastTap.current === now) onClose();
        }, 300);
      }
    }
  };

  const step = (f: number) => {
    const c = center();
    zoomAt(viewRef.current.s * f, c.x, c.y);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90" role="dialog" aria-modal="true" aria-label={alt}>
      <div className="flex items-center justify-between gap-2 p-3 text-white">
        <span className="text-xs text-white/60">
          {Math.round(view.s * 100)} % · doble toque o pellizca para hacer zoom
        </span>
        <div className="flex gap-2">
          <Btn label="Alejar" onClick={() => step(1 / 1.5)} d="M5 11h14v2H5z" />
          <Btn label="Acercar" onClick={() => step(1.5)} d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" />
          <Btn
            label="Tamaño original"
            onClick={() => setView({ s: 1, x: 0, y: 0 })}
            d="M4 4h6v2H6v4H4V4Zm10 0h6v6h-2V6h-4V4ZM4 14h2v4h4v2H4v-6Zm14 0h2v6h-6v-2h4v-4Z"
          />
          <Btn
            label="Cerrar"
            onClick={onClose}
            d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5Z"
          />
        </div>
      </div>
      <div
        ref={boxRef}
        className="relative flex min-h-0 flex-1 touch-none select-none items-center justify-center overflow-hidden"
        style={{ cursor: view.s > 1 ? "grab" : "zoom-in" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={alt}
          draggable={false}
          onError={() => url !== fallback && setUrl(fallback)}
          className="max-h-full max-w-full object-contain"
          style={{
            // La foto se agranda hasta llenar la pantalla aunque la original sea pequeña.
            width: "min(100%, calc((100vh - 64px) * 0.75))",
            height: "auto",
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`,
            transition: gesture.current ? "none" : "transform 0.15s ease-out",
          }}
        />
      </div>
    </div>
  );
}

function Btn({ label, onClick, d }: { label: string; onClick: () => void; d: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
    >
      <Icon d={d} />
    </button>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
