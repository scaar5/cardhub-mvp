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
}

const input =
  "w-full rounded border border-term-border bg-term-bg px-3 py-2 text-sm outline-none focus:border-term-green";

export default function ValorarForm() {
  const [key, setKey] = useState("");
  const [platform, setPlatform] = useState<"vinted" | "wallapop">("vinted");
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [url, setUrl] = useState("");
  const [query, setQuery] = useState("");
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

  const color =
    res?.pct === undefined
      ? ""
      : res.pct >= 30
        ? "text-term-green"
        : res.pct >= 15
          ? "text-term-amber"
          : "text-term-red";

  return (
    <div className="mt-8 space-y-4 rounded border border-term-border bg-term-panel p-5">
      <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
        <label className="block text-xs text-term-dim">
          título del anuncio
          <input className={input} value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Topps Chrome Lamine Yamal refractor" />
        </label>
        <label className="block text-xs text-term-dim">
          precio (€)
          <input className={input} value={price} onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal" placeholder="12,50" />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
        <label className="block text-xs text-term-dim">
          plataforma
          <select className={input} value={platform}
            onChange={(e) => setPlatform(e.target.value as "vinted" | "wallapop")}>
            <option value="vinted">vinted</option>
            <option value="wallapop">wallapop</option>
          </select>
        </label>
        <label className="block text-xs text-term-dim">
          enlace (opcional)
          <input className={input} value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.vinted.es/items/..." />
        </label>
      </div>

      <label className="block text-xs text-term-dim">
        buscar en eBay como… (opcional — si lo dejas vacío uso el título)
        <input className={input} value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="topps chrome yamal refractor" />
      </label>

      <label className="block text-xs text-term-dim">
        tu clave (ALERT_SECRET) — se recuerda en este navegador
        <input className={input} type="password" value={key} onChange={(e) => setKey(e.target.value)} />
      </label>

      <div className="flex flex-wrap gap-3 pt-2">
        <button disabled={busy || !title || !price || !key} onClick={() => send(false)}
          className="rounded border border-term-green px-4 py-2 text-sm text-term-green hover:bg-term-green hover:text-term-bg disabled:opacity-40">
          {busy ? "calculando…" : "> valorar"}
        </button>
        <button disabled={busy || !title || !price || !key} onClick={() => send(true)}
          className="rounded border border-term-border px-4 py-2 text-sm text-term-dim hover:border-term-green hover:text-term-green disabled:opacity-40">
          &gt; valorar y guardar
        </button>
      </div>

      {res && (
        <div className="mt-4 rounded border border-term-border bg-term-bg p-4 text-sm">
          {!res.ok ? (
            <p className="text-term-red">error: {res.error}</p>
          ) : (
            <>
              <p>
                valor de mercado: <b>{res.market_value?.toFixed(2)} €</b>{" "}
                <span className="text-term-dim">({res.sample} anuncios en eBay para “{res.query}”)</span>
              </p>
              <p className={`mt-1 text-2xl font-bold ${color}`}>
                {res.pct! >= 0 ? `-${res.pct}%` : `+${-res.pct!}%`}{" "}
                {res.pct! >= 30 ? "CHOLLO" : res.pct! >= 15 ? "buen precio" : "no es chollo"}
              </p>
              {!res.reliable && (
                <p className="mt-1 text-xs text-term-amber">
                  pocos comparables: prueba una búsqueda más general en “buscar en eBay como…”
                </p>
              )}
              {res.saved && (
                <p className="mt-1 text-xs text-term-dim">
                  guardado{res.alerted ? " · alerta enviada a Telegram" : ""}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
