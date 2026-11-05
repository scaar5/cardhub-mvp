function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-term-green" : "bg-term-amber"}`}
    />
  );
}

export default function StatusBar({
  supabase,
  telegram,
}: {
  supabase: boolean;
  telegram: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-term-border bg-term-panel px-4 py-2 text-xs text-term-dim">
      <span className="flex items-center gap-2">
        <Dot ok /> vercel: online
      </span>
      <span className="flex items-center gap-2">
        <Dot ok={supabase} /> supabase: {supabase ? "conectado" : "sin configurar (modo demo)"}
      </span>
      <span className="flex items-center gap-2">
        <Dot ok={telegram} /> telegram: {telegram ? "listo" : "sin configurar"}
      </span>
      <span className="ml-auto">v0.1.0</span>
    </div>
  );
}
