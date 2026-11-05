import { discount, type Deal } from "@/lib/types";

function DiscountBadge({ pct }: { pct: number }) {
  const color =
    pct >= 40 ? "text-term-green" : pct >= 20 ? "text-term-amber" : "text-term-dim";
  return <span className={`font-bold ${color}`}>-{pct}%</span>;
}

export default function DealsTable({ deals }: { deals: Deal[] }) {
  return (
    <div className="overflow-x-auto rounded border border-term-border bg-term-panel">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-term-border text-xs uppercase text-term-dim">
          <tr>
            <th className="px-4 py-3">Carta / Cromo</th>
            <th className="px-4 py-3">Plataforma</th>
            <th className="px-4 py-3 text-right">Precio</th>
            <th className="px-4 py-3 text-right">Valor mercado</th>
            <th className="px-4 py-3 text-right">Chollo</th>
          </tr>
        </thead>
        <tbody>
          {deals.map((d) => (
            <tr key={d.id} className="border-b border-term-border/60 last:border-0 hover:bg-white/[0.02]">
              <td className="px-4 py-3">
                {d.url ? (
                  <a href={d.url} target="_blank" rel="noreferrer" className="hover:text-term-green">
                    {d.title}
                  </a>
                ) : (
                  d.title
                )}
              </td>
              <td className="px-4 py-3 text-term-dim">{d.platform}</td>
              <td className="px-4 py-3 text-right">{d.price.toFixed(2)} €</td>
              <td className="px-4 py-3 text-right text-term-dim">{d.market_value.toFixed(2)} €</td>
              <td className="px-4 py-3 text-right">
                <DiscountBadge pct={discount(d)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
