import { discount, type Deal, type Platform } from "@/lib/types";

const PLATFORM: Record<Platform, { label: string; initials: string; className: string }> = {
  ebay: { label: "eBay", initials: "eB", className: "bg-accent-soft text-accent" },
  vinted: { label: "Vinted", initials: "V", className: "bg-[#e6f6f7] text-[#007782]" },
  wallapop: { label: "Wallapop", initials: "W", className: "bg-[#e5f8f3] text-[#0c9e7c]" },
};

const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });

function timeAgo(iso: string): string {
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (Math.abs(mins) < 60) return rtf.format(mins, "minute");
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  return rtf.format(Math.round(hours / 24), "day");
}

function DiscountPill({ pct }: { pct: number }) {
  const cls =
    pct >= 30
      ? "bg-good-soft text-good"
      : pct >= 15
        ? "bg-warn-soft text-warn"
        : "bg-canvas text-muted";
  return (
    <span className={`tabular rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      −{pct}%
    </span>
  );
}

/** Lista de anuncios al estilo "movimientos" de una app de banca. */
export default function DealsTable({ deals }: { deals: Deal[] }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-3xl bg-card shadow-card">
      {deals.map((d) => {
        const p = PLATFORM[d.platform] ?? PLATFORM.ebay;
        const pct = discount(d);
        const row = (
          <div className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-canvas/60">
            <span
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-semibold ${p.className}`}
            >
              {p.initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium">{d.title}</p>
              <p className="mt-0.5 text-sm text-muted">
                {p.label} · {timeAgo(d.created_at)}
              </p>
            </div>
            <div className="text-right">
              <p className="tabular text-[15px] font-semibold">{eur.format(d.price)}</p>
              <div className="mt-1 flex items-center justify-end gap-2">
                <span className="tabular hidden text-xs text-faint line-through sm:inline">
                  {eur.format(d.market_value)}
                </span>
                <DiscountPill pct={pct} />
              </div>
            </div>
          </div>
        );
        return (
          <li key={d.id}>
            {d.url ? (
              <a href={d.url} target="_blank" rel="noreferrer" className="block">
                {row}
              </a>
            ) : (
              row
            )}
          </li>
        );
      })}
    </ul>
  );
}
