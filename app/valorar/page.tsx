import Link from "next/link";
import ValorarForm from "@/components/ValorarForm";

export const metadata = { title: "Valorar anuncio — sCARDs" };

export default function ValorarPage() {
  return (
    <main className="mx-auto max-w-xl px-5 pb-16 pt-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 rounded-full bg-card px-3.5 py-1.5 text-sm text-muted shadow-card hover:text-ink"
      >
        ← Inicio
      </Link>
      <h1 className="mt-8 text-3xl font-semibold tracking-tight">Valorar un anuncio</h1>
      <p className="mt-2 text-[15px] text-muted">
        Pega un anuncio de Vinted o Wallapop. Comparo su precio con eBay España y te digo si es un
        chollo.
      </p>
      <ValorarForm />
    </main>
  );
}
