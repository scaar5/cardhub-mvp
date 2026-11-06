"use client";

import { useEffect, useState } from "react";

interface Result {
  ok: boolean;
  error?: string;
  query?: string;
  market_value?: number;
  sample?: number;
  reliable?: boolean;
  pct?: number;
  saved?: boolean;
  alerted?: boolean;
  excluded?: string | null;
}

const EXCLUDED_LABEL: Record<string, string> = {
  lote: "un lote o pack",
  graduada: "una carta graduada (PSA/BGS)",
  "réplica": "una réplica o custom",
  "elige-tu-carta": "un anuncio de “elige tu carta”",
  accesorio: "un accesorio, no una carta",
};

type Platform = "vinted" | "wallapop";

const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

const input =
  "mt-1.5 w-full rounded-2xl border border-line bg-canvas px-4 py-3 text-[15px] text-ink outline-none transition placeholder:text-faint focus:border-accent focus:bg-card focus:ring-4 focus:ring-accent-soft";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-muted">
      {label}
      {children}
    </label>
  );
}

export default function ValorarForm() {
  const [key, setKey] = useState("");
  const [platform, setPlatform] = useState<Platform>("vinted");
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [url, setUrl] = useState("");
  const [query, setQuery] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);

  useEffect(() => {
    try {
      setKey(localStorage.getItem("scards-key") ?? "");
    } catch {}
  }, []);

  async function send(save: boolean) {
    setBusy(true);
    setRes(null);
    try {
      try {
        localStorage.setItem("scards-key", key);
      } catch {}
      const r = await fetch("/api/valorar", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-alert-secret": key },
        body: JSON.stringify({ platform, title, price, url, query, save }),
      });
      setRes(await r.json());
    } catch (e) {
      setRes({ ok: false, error: String(e) });
    } finally {
      setBusy(false);
    }
  }

  const ready = !busy && title && price && key;
  const pct = res?.pct ?? 0;
  const verdict =
    pct >= 30
      ? { text: "Es un chollo", cls: "bg-good-soft text-good" }
      : pct >= 15
        ? { text: "Buen precio", cls: "bg-warn-soft text-warn" }
        : { text: "No es chollo", cls: "bg-bad-soft text-bad" };

  return (
    <div className="mt-8 space-y-5">
      <div className="space-y-5 rounded-3xl bg-card p-6 shadow-card">
        {/* Plataforma */}
        <div className="grid grid-cols-2 gap-1 rounded-full bg-canvas p-1">
          {(["vinted", "wallapop"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlatform(p)}
              className={`rounded-full py-2 text-sm font-semibold capitalize transition ${
                platform === p ? "bg-card text-ink shadow-card" : "text-muted hover:text-ink"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        <Field label="Título del anuncio">
          <input className={input} value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Topps Chrome Lamine Yamal refractor" />
        </Field>

        <Field label="Precio">
          <div className="relative">
            <input className={`${input} pr-10`} value={price} onChange={(e) => setPrice(e.target.value)}
              inputMode="decimal" placeholder="12,50" />
            <span className="pointer-events-none absolute right-4 top-1/2 mt-0.5 -translate-y-1/2 text-faint">€</span>
          </div>
        </Field>

        {showMore ? (
          <>
            <Field label="Enlace al anuncio (opcional)">
              <input className={input} value={url} onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.vinted.es/items/…" />
            </Field>
            <Field label="Buscar en eBay como… (opcional)">
              <input className={input} value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Si lo dejas vacío uso el título" />
            </Field>
          </>
        ) : (
          <button type="button" onClick={() => setShowMore(true)}
            className="text-sm font-medium text-accent hover:underline">
            + Añadir enlace o búsqueda personalizada
          </button>
        )}

        <Field label="Tu clave">
          <input className={input} type="password" value={key} onChange={(e) => setKey(e.target.value)}
            placeholder="La contraseña ALERT_SECRET" />
          <span className="mt-1.5 block text-xs font-normal text-faint">Se recuerda en este navegador.</span>
        </Field>

        <div className="flex flex-col gap-2.5 pt-1 sm:flex-row">
          <button disabled={!ready} onClick={() => send(false)}
            className="flex-1 rounded-full bg-ink py-3.5 text-[15px] font-semibold text-white transition hover:bg-ink/85 disabled:cursor-not-allowed disabled:opacity-30">
            {busy ? "Calculando…" : "Valorar"}
          </button>
          <button disabled={!ready} onClick={() => send(true)}
            className="flex-1 rounded-full bg-canvas py-3.5 text-[15px] font-semibold text-ink transition hover:bg-line disabled:cursor-not-allowed disabled:opacity-30">
            Valorar y guardar
          </button>
        </div>
      </div>

      {res && (
        <div className="rounded-3xl bg-card p-6 shadow-card">
          {!res.ok ? (
            <p className="text-[15px] text-bad">{res.error}</p>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-muted">Valor de mercado</p>
                  <p className="tabular mt-1 text-4xl font-semibold tracking-tight">
                    {eur.format(res.market_value ?? 0)}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1.5 text-sm font-semibold ${verdict.cls}`}>
                  {verdict.text}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-canvas p-4">
                  <p className="text-xs text-muted">Precio del anuncio</p>
                  <p className="tabular mt-1 text-lg font-semibold">
                    {eur.format(Number(price.replace(",", ".")) || 0)}
                  </p>
                </div>
                <div className="rounded-2xl bg-canvas p-4">
                  <p className="text-xs text-muted">{pct >= 0 ? "Descuento" : "Sobreprecio"}</p>
                  <p className={`tabular mt-1 text-lg font-semibold ${pct >= 15 ? "text-good" : pct < 0 ? "text-bad" : ""}`}>
                    {pct >= 0 ? `−${pct}%` : `+${-pct}%`}
                  </p>
                </div>
              </div>

              <p className="mt-4 text-xs text-faint">
                Basado en {res.sample} anuncios de eBay para “{res.query}”.
                {!res.reliable && " Pocos comparables: prueba una búsqueda más general."}
              </p>
              {res.excluded && (
                <p className="mt-2 text-xs font-medium text-bad">
                  Ojo: parece {EXCLUDED_LABEL[res.excluded] ?? "un anuncio especial"}. El valor de mercado
                  es de cartas sueltas normales, así que la comparación puede no ser justa.
                </p>
              )}
              {res.saved && (
                <p className="mt-2 text-sm font-medium text-good">
                  ✓ Guardado{res.alerted ? " · alerta enviada a Telegram" : ""}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
