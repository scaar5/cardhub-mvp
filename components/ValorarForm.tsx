"use client";

import { useEffect, useState } from "react";

/** País del anuncio de eBay según el dominio del enlace (ebay.it → "IT"). */
function ebayLabel(url: string | null): string {
  const m = url?.match(/ebay\.(es|it|de|fr)\b/);
  return m ? `eBay ${m[1].toUpperCase()}` : "eBay";
}

interface Comparable {
  title: string;
  price: number;
  url: string | null;
  date: string | null;
  platform: "vinted_sold" | "ebay";
}

interface Result {
  ok: boolean;
  error?: string;
  card?: string | null;
  confidence?: "alta" | "media" | null;
  approximate?: boolean;
  searched?: string[];
  comparables?: Comparable[];
  market_value?: number | null;
  reason?: string;
  sample?: number;
  source?: "vinted_sold" | "ebay";
  level?: 1 | 2 | 3 | null;
  based_on?: string | null;
  pct?: number;
  verdict?: "chollo" | "buen-precio" | "normal" | "caro" | "sospechoso";
  verdict_note?: string | null;
  saved?: boolean;
  alerted?: boolean;
  excluded?: string | null;
}

const VERDICT: Record<string, { text: string; cls: string }> = {
  chollo: { text: "Es un chollo", cls: "bg-good-soft text-good" },
  "buen-precio": { text: "Buen precio", cls: "bg-warn-soft text-warn" },
  normal: { text: "Precio normal", cls: "bg-canvas text-muted" },
  caro: { text: "Caro", cls: "bg-bad-soft text-bad" },
  sospechoso: { text: "Revisar: demasiado barato", cls: "bg-warn-soft text-warn" },
};

const shortDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "short" }) : null;

function sourceText(r: Result): string {
  const n = r.sample ?? 0;
  if (r.source === "vinted_sold") return `Mediana de ${n} ventas reales en Vinted (últimos 90 días).`;
  const how = n >= 4 ? "precio bajo (percentil 25)" : "el más barato";
  return `Basado en ${n} anuncios en venta en eBay (España, Italia y Alemania): ${how}, porque son precios pedidos, no vendidos.`;
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
    setShowAll(false);
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
  const verdict = VERDICT[res?.verdict ?? "normal"] ?? VERDICT.normal;
  const [showAll, setShowAll] = useState(false);
  const comps = res?.comparables ?? [];
  const visible = showAll ? comps : comps.slice(0, 6);

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
            <Field label="Buscar en eBay como… (opcional, solo si no reconozco la carta)">
              <input className={input} value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Ej.: Topps Chrome UCC 2020-21 Bellingham /299" />
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
              {/* Carta reconocida */}
              <p className="text-xs font-medium uppercase tracking-wide text-faint">Carta</p>
              <p className="mt-1 text-[15px] font-semibold text-ink">
                {res.card ?? "No está en el catálogo"}
              </p>
              {!res.card && (
                <p className="mt-1 text-xs text-muted">
                  Busco en eBay con el título tal cual, contando solo anuncios con las mismas palabras y la misma
                  numeración.
                </p>
              )}

              {res.market_value == null ? (
                <div className="mt-5 rounded-2xl bg-canvas p-4">
                  <p className="text-[15px] font-semibold text-ink">No puedo valorarla con fiabilidad</p>
                  <p className="mt-1 text-sm text-muted">{res.reason}</p>
                  <p className="mt-2 text-xs text-faint">
                    Prueba a poner en el título la colección y la temporada (p. ej. “Topps Chrome UCC 2020-21”) o
                    usa “Buscar en eBay como…”.
                  </p>
                </div>
              ) : (
                <>
                  <div className="mt-5 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm text-muted">
                        Valor de referencia{res.approximate ? " (aproximado)" : ""}
                      </p>
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
                      <p className={`tabular mt-1 text-lg font-semibold ${pct >= 25 ? "text-good" : pct < 0 ? "text-bad" : ""}`}>
                        {pct >= 0 ? `−${pct}%` : `+${-pct}%`}
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 text-xs text-muted">{sourceText(res)}</p>
                  {res.based_on && (
                    <p className="mt-1 text-xs text-warn">
                      Estimado con {res.based_on}, porque no hay datos de esta paralela exacta.
                    </p>
                  )}
                  {res.approximate && (
                    <p className="mt-1 text-xs text-warn">
                      Aproximado: la carta no está en el catálogo y los anuncios pueden ser de otra temporada.
                      Revisa los enlaces de abajo.
                    </p>
                  )}
                  {res.verdict === "sospechoso" && res.verdict_note && (
                    <p className="mt-1 text-xs text-warn">Descuento sospechoso ({res.verdict_note}).</p>
                  )}
                  {res.verdict_note && /menos de/.test(res.verdict_note) && (
                    <p className="mt-1 text-xs text-muted">Carta de poco valor ({res.verdict_note}).</p>
                  )}
                </>
              )}

              {/* Comparables con enlace */}
              {comps.length > 0 && (
                <div className="mt-6">
                  <p className="text-sm font-semibold text-ink">
                    {res.market_value == null ? "Lo que he encontrado" : "De dónde sale el precio"}
                    <span className="ml-1.5 font-normal text-faint">({comps.length})</span>
                  </p>
                  <ul className="mt-2 divide-y divide-line">
                    {visible.map((c, i) => (
                      <li key={i} className="flex items-center gap-3 py-2.5">
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          c.platform === "vinted_sold" ? "bg-good-soft text-good" : "bg-canvas text-muted"
                        }`}>
                          {c.platform === "vinted_sold" ? "Vendida Vinted" : ebayLabel(c.url)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-ink" title={c.title}>
                          {c.url ? (
                            <a href={c.url} target="_blank" rel="noopener noreferrer" className="hover:text-accent hover:underline">
                              {c.title}
                            </a>
                          ) : (
                            c.title
                          )}
                        </span>
                        {shortDate(c.date) && <span className="shrink-0 text-xs text-faint">{shortDate(c.date)}</span>}
                        <span className="tabular shrink-0 text-sm font-semibold">{eur.format(c.price)}</span>
                      </li>
                    ))}
                  </ul>
                  {comps.length > 6 && (
                    <button type="button" onClick={() => setShowAll(!showAll)}
                      className="mt-2 text-sm font-medium text-accent hover:underline">
                      {showAll ? "Ver menos" : `Ver las ${comps.length}`}
                    </button>
                  )}
                </div>
              )}

              {res.excluded && (
                <p className="mt-4 text-xs font-medium text-bad">
                  Ojo: parece {EXCLUDED_LABEL[res.excluded] ?? "un anuncio especial"}. El valor de referencia
                  es de cartas sueltas normales, así que la comparación puede no ser justa.
                </p>
              )}
              {res.saved && (
                <p className="mt-3 text-sm font-medium text-good">
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
