import Link from "next/link";

function Pill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      title={ok ? `${label}: conectado` : `${label}: sin configurar`}
      className="inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-xs text-muted shadow-card"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-good" : "bg-faint"}`} />
      {label}
    </span>
  );
}

/** Cabecera: logo, estado de las conexiones y acceso al valorador. */
export default function StatusBar({
  supabase,
  telegram,
  ebay,
}: {
  supabase: boolean;
  telegram: boolean;
  ebay: boolean;
}) {
  return (
    <header className="mx-auto flex max-w-5xl items-center gap-4 px-5 pt-6">
      <Link href="/" className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-ink text-sm font-bold text-white">
          s
        </span>
        <span className="text-lg font-semibold tracking-tight">sCARDs</span>
      </Link>

      <div className="ml-auto hidden items-center gap-2 sm:flex">
        <Pill ok={ebay} label="eBay" />
        <Pill ok={supabase} label="Base de datos" />
        <Pill ok={telegram} label="Telegram" />
      </div>
    </header>
  );
}
