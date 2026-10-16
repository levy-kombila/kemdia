import { BadgeCheck, ChevronDown, Package, Smartphone, Store, Truck, Users } from "lucide-react";
import type { Metadata } from "next";
import { ProductImage } from "@/components/ui/ProductImage";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { getCategoryTiles } from "@/lib/catalog";
import { VendorInterestForm } from "./VendorInterestForm";

export const metadata: Metadata = {
  title: "Vendre sur Kemdia",
  description:
    "Ouvrez votre boutique sur Kemdia : vos produits visibles partout au Gabon, paiements Airtel Money et Moov Money, livraison organisée par Kemdia.",
  alternates: { canonical: "/vendre" },
};

const BENEFITS = [
  {
    icon: Users,
    title: "Des clients partout au Gabon",
    text: "Vos produits sont vus à Libreville, Port-Gentil, Franceville et dans tout le pays, sur le site et via WhatsApp.",
  },
  {
    icon: Smartphone,
    title: "Paiements Mobile Money",
    text: "Vos clients paient par Airtel Money, Moov Money ou à la livraison. Vos ventes vous sont reversées sur votre compte.",
  },
  {
    icon: Truck,
    title: "La livraison, on s'en occupe",
    text: "Kemdia organise la collecte et la livraison avec son transporteur partenaire. Vous préparez le colis, c'est tout.",
  },
  {
    icon: Store,
    title: "Votre espace vendeur",
    text: "Ajoutez vos produits, suivez vos commandes, vos stocks et vos versements depuis votre téléphone.",
  },
];

const STEPS = [
  {
    title: "Faites votre demande",
    text: "Remplissez le formulaire ci-dessous : l'équipe Kemdia vous rappelle pour présenter l'offre.",
  },
  {
    title: "Faites vérifier votre boutique",
    text: "Pièce d'identité et compte Mobile Money ou bancaire : cette vérification protège les clients et vos paiements.",
  },
  {
    title: "Publiez vos produits",
    text: "Photos, description, prix et stock. Chaque produit est relu par Kemdia avant sa mise en ligne.",
  },
  {
    title: "Vendez et soyez payé",
    text: "Vous acceptez chaque commande, Kemdia livre, et le montant de la vente vous est versé, commission déduite.",
  },
];

const FAQ = [
  {
    q: "Combien coûte la vente sur Kemdia ?",
    a: "Kemdia prend une commission sur chaque vente, de 8 % à 14 % selon la catégorie du produit. Le barème définitif sera communiqué à l'ouverture de l'espace vendeur.",
  },
  {
    q: "Quand suis-je payé ?",
    a: "Après la livraison au client (le délai précis sera communiqué à l'ouverture), sur votre compte Airtel Money, Moov Money ou bancaire. Aucun versement n'est possible tant que votre identité n'a pas été vérifiée.",
  },
  {
    q: "Quels produits puis-je vendre ?",
    a: "High-tech, mode, maison, beauté, sport… Les produits interdits par la loi gabonaise, les contrefaçons et les produits dangereux sont refusés.",
  },
  {
    q: "Je n'ai pas de boutique physique, puis-je vendre ?",
    a: "Oui. Une pièce d'identité valide et un compte pour recevoir vos paiements suffisent ; les entreprises fournissent aussi leur RCCM.",
  },
  {
    q: "Qui s'occupe du service client ?",
    a: "Kemdia répond aux clients (WhatsApp, téléphone) et vous contacte si une commande vous concerne.",
  },
];

export default async function SellPage() {
  const tiles = (await getCategoryTiles()).slice(0, 3);
  const photos = tiles
    .flatMap((t) => t.products.slice(0, 2))
    .filter((p): p is typeof p & { image: string } => p.image !== null)
    .slice(0, 6);

  return (
    <div className="container-page space-y-3 py-4">
      <Breadcrumbs items={[{ label: "Vendre sur Kemdia" }]} />

      <section className="bg-forest-600 relative grid overflow-hidden rounded-xl text-white lg:grid-cols-[1.2fr_1fr]">
        <div className="relative z-10 px-6 py-10 sm:px-10 lg:py-14">
          <p className="text-sm font-semibold text-white">Kemdia Marketplace</p>
          <h1 className="mt-1 text-3xl font-extrabold leading-[1.05] sm:text-5xl">
            Vendez partout au Gabon avec Kemdia
          </h1>
          <p className="mt-4 max-w-lg text-lg text-white">
            Vos produits en ligne, payés par Mobile Money et livrés jusque chez vos clients. Nous
            recherchons nos premiers vendeurs partenaires pour le lancement.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="#demande"
              className="bg-accent-400 hover:bg-accent-300 text-ink-900 inline-flex h-12 items-center rounded-full px-6 font-bold"
            >
              Devenir vendeur
            </a>
            <a
              href="#questions"
              className="inline-flex h-12 items-center rounded-full border border-white/50 px-6 font-semibold hover:bg-white/10"
            >
              Questions fréquentes
            </a>
          </div>
        </div>
        <ul
          aria-hidden
          className="hidden grid-cols-3 gap-3 p-6 lg:grid lg:rotate-[-4deg] lg:scale-110"
        >
          {photos.map((p) => (
            <li key={p.id} className="relative aspect-square overflow-hidden rounded-xl bg-white">
              <ProductImage
                src={p.image}
                alt=""
                fill
                sizes="140px"
                className="object-contain p-2"
              />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="avantages" className="rounded-xl bg-white px-5 py-6 sm:px-8">
        <h2 id="avantages" className="text-xl font-extrabold sm:text-2xl">
          Pourquoi vendre sur Kemdia
        </h2>
        <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map(({ icon: Icon, title, text }) => (
            <li key={title}>
              <span className="bg-forest-50 text-forest-700 grid size-11 place-items-center rounded-full">
                <Icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-3 font-bold">{title}</h3>
              <p className="text-ink-700 mt-1 text-sm leading-6">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="etapes" className="rounded-xl bg-white px-5 py-6 sm:px-8">
        <h2 id="etapes" className="text-xl font-extrabold sm:text-2xl">
          Comment ça marche
        </h2>
        <ol className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="border-ink-100 relative rounded-xl border p-4">
              <span
                className="font-price bg-brand-600 grid size-9 place-items-center rounded-full text-lg text-white"
                aria-hidden
              >
                {i + 1}
              </span>
              <h3 className="mt-3 font-bold">
                <span className="sr-only">Étape {i + 1} : </span>
                {s.title}
              </h3>
              <p className="text-ink-700 mt-1 text-sm leading-6">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-3 lg:grid-cols-[1fr_1.1fr]">
        <section aria-labelledby="conditions" className="rounded-xl bg-white px-5 py-6 sm:px-8">
          <h2 id="conditions" className="text-xl font-extrabold">
            Ce qu&apos;il vous faut
          </h2>
          <ul className="mt-4 space-y-3 text-sm">
            {[
              [BadgeCheck, "Une pièce d'identité valide (et le RCCM pour une entreprise)"],
              [
                Smartphone,
                "Un compte Airtel Money, Moov Money ou bancaire pour recevoir vos ventes",
              ],
              [Package, "Des produits neufs ou en parfait état, avec de vraies photos"],
              [Users, "Un numéro joignable pour accepter les commandes rapidement"],
            ].map(([Icon, text]) => {
              const I = Icon as typeof BadgeCheck;
              return (
                <li key={text as string} className="flex gap-3">
                  <I className="text-forest-600 mt-0.5 size-5 shrink-0" aria-hidden />
                  {text as string}
                </li>
              );
            })}
          </ul>

          <h2 id="questions" className="mt-8 scroll-mt-40 text-xl font-extrabold">
            Questions fréquentes
          </h2>
          <div className="divide-ink-100 mt-3 divide-y">
            {FAQ.map((f) => (
              <details key={f.q} className="group py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <ChevronDown
                    className="text-ink-500 size-4 shrink-0 transition group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <p className="text-ink-700 mt-2 text-sm leading-6">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section
          id="demande"
          aria-labelledby="demande-titre"
          className="scroll-mt-40 rounded-xl bg-white px-5 py-6 sm:px-8"
        >
          <h2 id="demande-titre" className="text-xl font-extrabold">
            Demande d&apos;ouverture de boutique
          </h2>
          <p className="text-ink-500 mt-1 text-sm">
            L&apos;équipe Kemdia vous rappelle pour vous présenter l&apos;offre.
          </p>
          <div className="mt-5">
            <VendorInterestForm />
          </div>
        </section>
      </div>
    </div>
  );
}
