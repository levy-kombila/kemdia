import { ArrowRight, RotateCcw, Search, ShieldCheck, Truck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/lib/types";

const PROMISES = [
  { icon: ShieldCheck, title: "Paiement", sub: "100 % sécurisé" },
  { icon: Truck, title: "Livraison rapide", sub: "partout au Gabon" },
  { icon: RotateCcw, title: "Retours faciles", sub: "sous 14 jours" },
];

/** Bannière d'accueil — transcription de la maquette « Bannière e-commerce » de l'ancien projet. */
export function Hero({ showcase }: { showcase: Product[] }) {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-white shadow-[var(--shadow-card)]">
      <div className="grid items-center lg:grid-cols-[1.1fr_1fr]">
        <div className="relative z-10 px-6 py-10 sm:px-10 lg:py-14">
          <p className="bg-brand-50 text-brand-700 mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold tracking-wide">
            <span aria-hidden className="bg-brand-600 size-1.5 rounded-full" /> ACHETEZ MALIN, VIVEZ
            MIEUX
          </p>
          <h1 className="text-ink-900 text-4xl font-extrabold leading-[1.1] sm:text-5xl">
            Des milliers de produits <br className="hidden sm:block" />
            aux <span className="text-brand-600">meilleurs prix</span>
          </h1>
          <p className="text-ink-500 mt-4 max-w-lg">
            High-tech, mode, maison, beauté et sport : commandez en quelques clics, payez par Mobile
            Money et faites-vous livrer à Libreville en 24–48 h.
          </p>

          <ul className="mt-7 grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-3">
            {PROMISES.map(({ icon: Icon, title, sub }) => (
              <li key={title} className="flex items-center gap-2 text-sm leading-tight">
                <Icon className="text-brand-600 size-7 shrink-0" strokeWidth={1.75} aria-hidden />
                <span>
                  <span className="block font-semibold">{title}</span>
                  <span className="text-ink-500">{sub}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="#vedette"
              className="bg-brand-600 hover:bg-brand-700 inline-flex h-12 items-center gap-2 rounded-full px-7 font-semibold text-white shadow-sm transition"
            >
              Découvrir <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link
              href="/promotions"
              className="border-ink-200 text-ink-900 hover:border-ink-900 inline-flex h-12 items-center gap-2 rounded-full border px-6 font-semibold transition"
            >
              Voir les promotions
            </Link>
          </div>
        </div>

        {/* Visuel : téléphone avec aperçu de l'application, construit en CSS + vraies photos produits */}
        <div className="from-ink-800 via-ink-900 to-ink-900 relative hidden h-full min-h-[26rem] overflow-hidden bg-gradient-to-br lg:block">
          <div
            aria-hidden
            className="bg-brand-600/90 absolute -left-24 -top-24 size-[28rem] rounded-full"
          />
          <div
            aria-hidden
            className="bg-accent-400/20 absolute -bottom-16 -right-10 size-64 rounded-full blur-2xl"
          />
          <div className="border-ink-900 absolute left-1/2 top-1/2 w-60 -translate-x-1/2 -translate-y-1/2 rotate-[-6deg] rounded-[2.2rem] border-[6px] bg-white p-3 shadow-2xl">
            <div className="bg-ink-200 mx-auto mb-2 h-1.5 w-16 rounded-full" />
            <p className="font-display text-center text-lg font-extrabold">
              Kem<span className="text-brand-600">dia</span>
            </p>
            <div className="border-ink-200 text-ink-400 my-2 flex items-center justify-between rounded-full border px-3 py-1.5 text-[0.6rem]">
              Rechercher un produit… <Search className="text-brand-600 size-3" aria-hidden />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {showcase.slice(0, 6).map((p) => (
                <div
                  key={p.id}
                  className="bg-ink-100 relative aspect-square overflow-hidden rounded-xl"
                >
                  {p.images[0] && (
                    <Image src={p.images[0]} alt="" fill sizes="110px" className="object-cover" />
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="absolute bottom-10 right-8 rotate-3 rounded-2xl bg-white px-4 py-3 shadow-xl">
            <p className="text-ink-500 text-xs">Livraison Libreville</p>
            <p className="font-display text-success-600 font-extrabold">Offerte dès 25 000 FCFA</p>
          </div>
        </div>
      </div>
    </section>
  );
}
