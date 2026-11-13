import Link from "next/link";
import { fetchAll } from "@/lib/fetch-all";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const metadata = { title: "Estado — sCARDs" };
export const revalidate = 120; // se recalcula como mucho cada 2 min

const REPO = "scaar5/cardhub-mvp";
const WORKFLOWS: { file: string; name: string; what: string }[] = [
  { file: "vinted-live.yml", name: "Chollos (Vinted cada 15 min)", what: "Lee los anuncios nuevos y manda las alertas" },
  { file: "vinted-sweep.yml", name: "Repaso completo de Vinted", what: "Recorre todo lo que hay a la venta (≥5 €)" },
  { file: "vinted-sold.yml", name: "Detector de ventas", what: "Abre los anuncios que desaparecen y apunta la venta" },
  { file: "sniper.yml", name: "Referencias de eBay", what: "Busca precios en eBay para las cartas sin ventas" },
];

const madridDay = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
const hora = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "—";
const n = (x: number) => x.toLocaleString("es-ES");
function hace(iso: string | null | undefined) {
  if (!iso) return "nunca";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return "ahora mismo";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `hace ${h} h ${min % 60 ? `${min % 60} min` : ""}`.trim();
  return `hace ${Math.floor(h / 24)} días`;
}
type Light = "ok" | "warn" | "bad";
const light = (iso: string | null | undefined, okMin: number, warnMin: number): Light => {
  if (!iso) return "bad";
  const m = (Date.now() - Date.parse(iso)) / 60000;
  return m <= okMin ? "ok" : m <= warnMin ? "warn" : "bad";
};
const DOT: Record<Light, string> = { ok: "bg-emerald-500", warn: "bg-amber-400", bad: "bg-rose-500" };
const LABEL: Record<Light, string> = { ok: "Funciona", warn: "Con retraso", bad: "Parado" };

async function lastRuns() {
  // API pública de GitHub (repo público). Si falla o se agota el límite, la página sigue sin esta parte.
  return Promise.all(
    WORKFLOWS.map(async (w) => {
      try {
        const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${w.file}/runs?per_page=3`, {
          headers: { Accept: "application/vnd.github+json", "User-Agent": "scards-estado" },
          next: { revalidate: 300 },
          signal: AbortSignal.timeout(5000),
        });
        if (!r.ok) return { ...w, runs: null };
        const j = (await r.json()) as {
          workflow_runs: { status: string; conclusion: string | null; created_at: string; html_url: string }[];
        };
        return { ...w, runs: j.workflow_runs };
      } catch {
        return { ...w, runs: null };
      }
    }),
  );
}

export default async function EstadoPage() {
  const db = getSupabaseAdmin();
  if (!db) {
    return (
      <main className="mx-auto max-w-5xl px-5 pb-16 pt-6">
        <p className="text-bad">Falta la conexión con la base de datos.</p>
      </main>
    );
  }

  const count = async (platform: string) =>
    (await db.from("listings").select("external_id", { count: "exact", head: true }).eq("platform", platform)).count ?? 0;
  const latest = async (col: string, platforms: string[]) => {
    const { data } = await db
      .from("listings")
      .select(col)
      .in("platform", platforms)
      .not(col, "is", null)
      .order(col, { ascending: false })
      .limit(1);
    return ((data?.[0] as unknown as Record<string, string> | undefined)?.[col] ?? null) as string | null;
  };

  const since14 = new Date(Date.now() - 14 * 86400_000).toISOString();
  type Closed = { platform: string; seen_at: string; price: number };
  type Deal = { created_at: string; feedback: string | null; ref_source: string | null };

  const [
    openRec,
    openX,
    soldAll,
    soldXAll,
    lastSeen,
    lastChecked,
    lastSale,
    closed,
    dealsRes,
    runs,
  ] = await Promise.all([
    count("vinted"),
    count("vinted_x"),
    count("vinted_sold"),
    count("vinted_x_sold"),
    latest("seen_at", ["vinted", "vinted_x"]),
    latest("checked_at", ["vinted", "vinted_x"]),
    latest("seen_at", ["vinted_sold", "vinted_x_sold"]),
    fetchAll<Closed>(
      (from, to) =>
        db
          .from("listings")
          .select("platform,seen_at,price")
          .in("platform", ["vinted_sold", "vinted_gone", "vinted_x_sold", "vinted_x_gone"])
          .gte("seen_at", since14)
          .order("seen_at")
          .range(from, to) as unknown as PromiseLike<{ data: Closed[] | null; error: { message: string } | null }>,
      30_000,
    ),
    db.from("deals").select("created_at,feedback,ref_source").order("created_at", { ascending: false }).limit(3000),
    lastRuns(),
  ]);

  // Ventas por día (Madrid), últimos 14 días
  const days: string[] = [];
  for (let i = 13; i >= 0; i--) days.push(madridDay(new Date(Date.now() - i * 86400_000)));
  const perDay = new Map(days.map((d) => [d, { sold: 0, soldX: 0, gone: 0, value: 0 }]));
  for (const r of closed.data) {
    const e = perDay.get(madridDay(new Date(r.seen_at)));
    if (!e) continue;
    if (r.platform === "vinted_sold") {
      e.sold++;
      e.value += Number(r.price);
    } else if (r.platform === "vinted_x_sold") e.soldX++;
    else e.gone++;
  }
  const today = perDay.get(days[days.length - 1])!;
  const yesterday = perDay.get(days[days.length - 2])!;
  const maxDay = Math.max(1, ...[...perDay.values()].map((e) => e.sold + e.soldX));
  const last7 = days.slice(-7).map((d) => perDay.get(d)!);
  const avg7 = Math.round(last7.reduce((a, e) => a + e.sold + e.soldX, 0) / 7);

  // Chollos y votos
  const deals = (dealsRes.data ?? []) as Deal[];
  const dealsByDay = new Map(days.slice(-7).map((d) => [d, 0]));
  for (const d of deals) {
    const k = madridDay(new Date(d.created_at));
    if (dealsByDay.has(k)) dealsByDay.set(k, (dealsByDay.get(k) ?? 0) + 1);
  }
  const voted = deals.filter((d) => d.feedback === "bueno" || d.feedback === "falso");
  const good = voted.filter((d) => d.feedback === "bueno").length;
  const SOURCE: Record<string, string> = {
    vinted_sold: "Ventas reales de Vinted",
    ebay: "Anuncios de eBay",
    vinted_open: "Anuncios abiertos de Vinted",
  };
  const bySource = new Map<string, { votes: number; good: number }>();
  for (const d of voted) {
    const k = d.ref_source ?? "otra";
    const e = bySource.get(k) ?? { votes: 0, good: 0 };
    e.votes++;
    if (d.feedback === "bueno") e.good++;
    bySource.set(k, e);
  }
  const lastDeal = deals[0]?.created_at ?? null;

  const health: { name: string; what: string; at: string | null; l: Light }[] = [
    { name: "Lectura de Vinted", what: "Último anuncio visto en las búsquedas", at: lastSeen, l: light(lastSeen, 30, 120) },
    { name: "Revisión de ventas", what: "Último anuncio abierto para ver si se vendió", at: lastChecked, l: light(lastChecked, 30, 120) },
    { name: "Última venta detectada", what: "Venta más reciente apuntada", at: lastSale, l: light(lastSale, 180, 720) },
    { name: "Última alerta de chollo", what: "Chollo nuevo más reciente", at: lastDeal, l: light(lastDeal, 24 * 60, 72 * 60) },
  ];

  const recognizedPct = openRec + openX ? Math.round((openRec / (openRec + openX)) * 100) : 0;

  return (
    <main className="mx-auto max-w-5xl px-5 pb-16 pt-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 rounded-full bg-card px-3.5 py-1.5 text-sm text-muted shadow-card hover:text-ink"
      >
        ← Inicio
      </Link>

      <h1 className="mt-8 text-3xl font-semibold tracking-tight">Estado</h1>
      <p className="mt-2 max-w-2xl text-[15px] text-muted">
        Cómo va todo ahora mismo: si los procesos funcionan, cuántas ventas se registran y cómo van los chollos. Se
        actualiza cada 2 minutos. Hora de Madrid.
      </p>

      {/* 1. Salud */}
      <h2 className="mt-10 text-lg font-semibold">¿Funciona todo?</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {health.map((h) => (
          <div key={h.name} className="rounded-2xl bg-card p-4 shadow-card">
            <div className="flex items-center gap-2">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${DOT[h.l]}`} />
              <span className="text-[15px] font-semibold">{h.name}</span>
              <span className="ml-auto text-xs text-muted">{LABEL[h.l]}</span>
            </div>
            <p className="mt-1 text-sm text-muted">{h.what}</p>
            <p className="mt-2 text-sm">
              <b>{hace(h.at)}</b> <span className="text-faint">· {hora(h.at)}</span>
            </p>
          </div>
        ))}
      </div>

      {/* 2. Procesos automáticos */}
      <h2 className="mt-10 text-lg font-semibold">Procesos automáticos</h2>
      <p className="mt-1 text-sm text-muted">
        GitHub los relanza cada hora y cada ejecución trabaja casi 2 horas, así que casi siempre hay una "en marcha". Las
        "canceladas" son ejecuciones que esperaban turno y se descartan al llegar la siguiente: es normal. Si una sale
        "con error" (punto rojo), avísame.
      </p>
      <div className="mt-3 overflow-hidden rounded-2xl bg-card shadow-card">
        {runs.map((w) => {
          const r = w.runs?.[0];
          const done = w.runs?.find((x) => x.status === "completed");
          const running = w.runs?.some((x) => x.status === "in_progress");
          const failed = done && done.conclusion !== "success" && done.conclusion !== "cancelled";
          const l: Light = !w.runs ? "warn" : failed ? "bad" : "ok";
          return (
            <div key={w.file} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-3 last:border-0">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${DOT[l]}`} />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-medium">{w.name}</p>
                <p className="text-xs text-muted">{w.what}</p>
              </div>
              <div className="text-right text-sm">
                {!w.runs ? (
                  <span className="text-muted">Sin datos de GitHub ahora</span>
                ) : (
                  <>
                    <p>{running ? "En marcha" : r ? hace(r.created_at) : "—"}</p>
                    {done && (
                      <a href={done.html_url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted hover:text-ink">
                        Última terminada: {done.conclusion === "success" ? "bien" : done.conclusion === "cancelled" ? "cancelada (normal)" : "con error"} · {hora(done.created_at)}
                      </a>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Ventas */}
      <h2 className="mt-10 text-lg font-semibold">Ventas registradas</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <Stat label="Hoy" value={n(today.sold + today.soldX)} sub={`${n(today.sold)} con carta · ${n(today.soldX)} sin reconocer`} />
        <Stat label="Ayer" value={n(yesterday.sold + yesterday.soldX)} sub={`${n(yesterday.sold)} con carta`} />
        <Stat label="Media 7 días" value={n(avg7)} sub="ventas al día" />
        <Stat label="Total" value={n(soldAll + soldXAll)} sub={`${n(soldAll)} con carta · ${n(soldXAll)} sin reconocer`} />
      </div>

      <div className="mt-4 rounded-2xl bg-card p-4 shadow-card">
        <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ink" /> Con carta</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ink/30" /> Sin reconocer</span>
          <span>· Bajas = anuncios borrados (no son ventas)</span>
        </div>
        <div className="space-y-1.5">
          {days
            .filter((d, i) => i >= days.findIndex((x) => { const e = perDay.get(x)!; return e.sold + e.soldX + e.gone > 0; }))
            .reverse()
            .map((d) => {
              const e = perDay.get(d)!;
              return (
                <div key={d} className="flex items-center gap-3 text-sm">
                  <span className="w-20 shrink-0 text-muted">
                    {new Date(`${d}T12:00:00`).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })}
                  </span>
                  <div className="flex h-4 flex-1 overflow-hidden rounded bg-canvas">
                    <div className="h-full bg-ink" style={{ width: `${(e.sold / maxDay) * 100}%` }} />
                    <div className="h-full bg-ink/30" style={{ width: `${(e.soldX / maxDay) * 100}%` }} />
                  </div>
                  <span className="w-12 shrink-0 text-right font-medium tabular-nums">{e.sold + e.soldX}</span>
                  <span className="hidden w-20 shrink-0 text-right text-xs text-faint sm:inline">{e.gone} bajas</span>
                </div>
              );
            })}
        </div>
      </div>

      {/* 4. Seguimiento */}
      <h2 className="mt-10 text-lg font-semibold">Anuncios en seguimiento</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Stat label="Total vigilados" value={n(openRec + openX)} sub="a la venta en Vinted, desde 5 €" />
        <Stat label="Con carta reconocida" value={n(openRec)} sub={`${recognizedPct} % del total`} />
        <Stat label="Sin reconocer" value={n(openX)} sub="se guardan igual; se asignan al ampliar el catálogo" />
      </div>

      {/* 5. Chollos */}
      <h2 className="mt-10 text-lg font-semibold">Chollos y votos</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Stat label="Alertas hoy" value={n(dealsByDay.get(days[days.length - 1]) ?? 0)} sub={`última: ${hace(lastDeal)}`} />
        <Stat
          label="Alertas últimos 7 días"
          value={n([...dealsByDay.values()].reduce((a, b) => a + b, 0))}
          sub={[...dealsByDay.values()].join(" · ")}
        />
        <Stat
          label="Aciertos según tus votos"
          value={voted.length ? `${Math.round((good / voted.length) * 100)} %` : "—"}
          sub={`${good} buenos de ${voted.length} votados`}
        />
      </div>
      {bySource.size > 0 && (
        <div className="mt-4 overflow-hidden rounded-2xl bg-card shadow-card">
          <p className="border-b border-line px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-faint">
            Aciertos según de dónde sale el precio
          </p>
          {[...bySource.entries()]
            .sort((a, b) => b[1].votes - a[1].votes)
            .map(([k, e]) => (
              <div key={k} className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-sm last:border-0">
                <span className="flex-1">{SOURCE[k] ?? k}</span>
                <span className="text-muted">{e.votes} votos</span>
                <span className="w-14 text-right font-semibold tabular-nums">{Math.round((e.good / e.votes) * 100)} %</span>
              </div>
            ))}
        </div>
      )}
    </main>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-card p-4 shadow-card">
      <p className="text-xs font-medium uppercase tracking-wide text-faint">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}
