"use client";

import { useRouter } from "next/navigation";

/** Desplegable que, al elegir una opción, va a su enlace (cada opción lleva ya su URL). */
export default function SelectNav({
  label,
  value,
  options,
  className = "",
}: {
  label: string;
  value: string;
  options: { href: string; label: string }[];
  className?: string;
}) {
  const router = useRouter();
  return (
    <label className={`relative inline-flex min-w-0 flex-col ${className}`}>
      <span className="mb-1 text-[11px] font-medium text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => router.push(e.target.value, { scroll: false })}
        className="min-w-0 cursor-pointer appearance-none truncate rounded-xl border border-line bg-card py-2 pl-3 pr-9 text-sm font-medium shadow-card outline-none focus:border-accent"
      >
        {options.map((o) => (
          <option key={o.href} value={o.href}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute bottom-2.5 right-3 text-xs text-muted">▾</span>
    </label>
  );
}
