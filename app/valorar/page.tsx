import Link from "next/link";
import ValorarForm from "@/components/ValorarForm";

export const metadata = { title: "Valorar anuncio — sCARDs" };

export default function ValorarPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/" className="text-xs text-term-dim hover:text-term-green">
        &lt; volver
      </Link>
      <h1 className="mt-3 text-3xl font-bold text-term-green">valorar anuncio</h1>
      <p className="mt-2 text-sm text-term-dim">
        Pega un anuncio de Vinted o Wallapop. Calculo su valor de mercado con los precios de eBay
        España y te digo si es chollo. Si lo guardas y baja un 30 % o más, te llega a Telegram.
      </p>
      <ValorarForm />
    </main>
  );
}
