import DealsTable from "@/components/DealsTable";
import StatusBar from "@/components/StatusBar";
import { demoDeals } from "@/lib/demo-data";
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
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data || data.length === 0) return { deals: demoDeals, live: false };
  return { deals: data as Deal[], live: true };
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded border border-term-border bg-term-panel p-4">
      <div className="text-xs uppercase text-term-dim">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${accent ? "text-term-green" : ""}`}>{value}</div>
    </div>
  );
}

export default async function Home() {
  const { deals, live } = await loadDeals();
  const telegramReady = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);

  const hot = deals.filter((d) => discount(d) >= 30);
  const avg = deals.length
    ? Math.round(deals.reduce((s, d) => s + discount(d), 0) / deals.length)
    : 0;

  return (
    <>
      <StatusBar supabase={live} telegram={telegramReady} />

      <main className="mx-auto max-w-6xl px-4 py-10">
        <header className="mb-10">
          <p className="text-xs text-term-dim">root@scards:~$ ./sniper --watch vinted wallapop</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-term-green sm:text-5xl">
            sCARDs<span className="cursor" />
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-term-dim">
            Analytics &amp; Sniper para cartas y cromos de fútbol (Panini, Topps). Valoración de
            mercado y alertas de chollos en Vinted y Wallapop directo a Telegram.
          </p>
        </header>

        <section className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Anuncios analizados" value={String(deals.length)} />
          <Stat label="Chollos (≥30%)" value={String(hot.length)} accent />
          <Stat label="Descuento medio" value={`${avg}%`} />
          <Stat label="Fuentes" value="2" />
        </section>

        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm uppercase text-term-dim">&gt; Últimos anuncios detectados</h2>
            {!live && <span className="text-xs text-term-amber">[datos de ejemplo]</span>}
          </div>
          <DealsTable deals={deals} />
        </section>

        <footer className="mt-12 border-t border-term-border pt-4 text-xs text-term-dim">
          sCARDs MVP · Next.js + Supabase + Telegram
        </footer>
      </main>
    </>
  );
}
