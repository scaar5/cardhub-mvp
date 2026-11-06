import Link from "next/link";
import DealsTable from "@/components/DealsTable";
import StatusBar from "@/components/StatusBar";
import { ALERT_THRESHOLD } from "@/lib/config";
import { demoDeals } from "@/lib/demo-data";
import { ebayConfigured } from "@/lib/ebay";
import { getSupabase } from "@/lib/supabase";
import { discount, type Deal } from "@/lib/types";

// Se vuelve a generar cada 60 s para mostrar chollos nuevos
export const revalidate = 60;

async function loadDeals(): Promise<{ deals: Deal[]; live: boolean }> {
  const supabase = getSupabase();
  if (!supabase) return { deals: demoDeals, live: false };

  const { data, error } = await supabase
    .from("deals")
    .select("id,title,platform,price,market_value,url,created_at")
    .neq("platform", "ebay") // eBay solo sirve de referencia de precio
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data) return { deals: demoDeals, live: false };
  return { deals: data as Deal[], live: true };
}

const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-3xl bg-card p-5 shadow-card">
      <p className="text-sm text-muted">{label}</p>
      <p className="tabular mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-faint">{hint}</p>}
    </div>
  );
}

export default async function Home() {
  const { deals, live } = await loadDeals();
  const telegramReady = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);

  const hot = deals.filter((d) => discount(d) >= ALERT_THRESHOLD);
  const avg = deals.length
    ? Math.round(deals.reduce((s, d) => s + discount(d), 0) / deals.length)
    : 0;
  const savings = hot.reduce((s, d) => s + Math.max(0, d.market_value - d.price), 0);

  return (
    <>
      <StatusBar supabase={live} telegram={telegramReady} ebay={ebayConfigured()} />

      <main className="mx-auto max-w-5xl px-5 pb-16 pt-10">
        {/* Hero */}
        <section className="rounded-[2rem] bg-ink px-7 py-9 text-white sm:px-10">
          <p className="text-sm text-white/60">Ahorro potencial en chollos</p>
          <p className="tabular mt-2 text-5xl font-semibold tracking-tight sm:text-6xl">
            {eur.format(savings)}
          </p>
          <p className="mt-3 max-w-md text-sm text-white/60">
            Cartas y cromos de fútbol en Vinted por debajo de su precio en eBay, comparando cada carta con sus propios anuncios.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/valorar"
              className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-white/90"
            >
              Valorar un anuncio
            </Link>
            <Link
              href="/cartas"
              className="rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              Catálogo de cartas
            </Link>
            <a
              href="#chollos"
              className="rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              Ver chollos
            </a>
          </div>
        </section>

        {/* Cifras */}
        <section className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Chollos" value={String(hot.length)} hint={`≥ ${ALERT_THRESHOLD}% de descuento`} />
          <Stat label="Anuncios" value={String(deals.length)} hint="últimos detectados" />
          <Stat label="Descuento medio" value={`${avg}%`} />
          <Stat label="Fuentes" value="2" hint="Vinted · referencia eBay" />
        </section>

        {/* Lista */}
        <section id="chollos" className="mt-10">
          <div className="mb-3 flex items-baseline justify-between px-1">
            <h2 className="text-lg font-semibold tracking-tight">Últimos anuncios</h2>
            {!live && (
              <span className="rounded-full bg-warn-soft px-2.5 py-1 text-xs font-medium text-warn">
                Datos de ejemplo
              </span>
            )}
          </div>
          {deals.length ? (
            <DealsTable deals={deals} />
          ) : (
            <div className="rounded-3xl bg-card px-6 py-14 text-center shadow-card">
              <p className="text-base font-medium">Todavía no hay anuncios</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                El sniper revisa Vinted cada 30 minutos y compara cada carta con su precio en eBay.
                Los chollos irán apareciendo aquí.
              </p>
              <Link
                href="/valorar"
                className="mt-5 inline-block rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white"
              >
                Valorar un anuncio
              </Link>
            </div>
          )}
        </section>

        <footer className="mt-14 text-center text-xs text-faint">sCARDs · v0.5</footer>
      </main>
    </>
  );
}
